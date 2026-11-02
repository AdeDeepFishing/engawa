import { type NextRequest } from "next/server";
import { extract, ExtractError } from "@/lib/claude/extract";
import { reconcile, type ReconcileDecision } from "@/lib/claude/reconcile";
import { BusyError, withUsage } from "@/lib/claude/usage";
import { hasDb } from "@/lib/db/client";
import { getBoardById } from "@/lib/db/boards";
import {
  claimForProcessing,
  downloadSubmissionImage,
  finishSubmission,
  getSubmission,
  markFailed,
  setStage,
  writeCardsForSubmission,
  type DecideFn,
} from "@/lib/db/submissions";
import type { Board } from "@/lib/types";
import { sniffImage } from "@/lib/image/strip";
import { encodeSse, type SseEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs the pipeline for one submission while the uploader keeps the
 * connection open, streaming stage events as server-sent events:
 *   stage  {stage}            stripping (images only), extracting, reconciling
 *   done   {status, card_ids, public_count, held_count, note_for_uploader,
 *           actions, latency_ms, reconcile_ms}
 *   failed {error, message}
 * `actions` has one reconcile action per fact (create, merge, update, conflict, hold).
 * Body: JSON {device_id}. The device must match the submission.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  const { id } = await params;
  let deviceId: string | undefined;
  try {
    const body = (await req.json()) as { device_id?: string };
    deviceId = body.device_id;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const sub = await getSubmission(id);
  if (!sub) return Response.json({ error: "not_found" }, { status: 404 });
  if (!deviceId || sub.device_id !== deviceId) return Response.json({ error: "forbidden" }, { status: 403 });
  const board = await getBoardById(sub.board_id);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });

  if (sub.status === "done" || sub.status === "held") {
    return sse([
      {
        event: "done",
        data: { status: sub.status, card_ids: sub.card_ids, public_count: null, held_count: null, note_for_uploader: null },
      },
    ]);
  }
  const isImage = sub.input_kind === "image";
  const claimed = await claimForProcessing(id, isImage ? "stripping" : "extracting");
  if (!claimed) return Response.json({ error: "already_processing" }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(encoder.encode(encodeSse(e)));
      try {
        let image: { data: string; mediaType: "image/jpeg" | "image/png" } | undefined;
        if (isImage) {
          // Text submissions have no image to prepare, so they skip this stage.
          send({ event: "stage", data: { stage: "stripping" } });
          const bytes = await downloadSubmissionImage(sub);
          if (!bytes) throw new Error("image missing");
          const mime = sniffImage(bytes);
          if (!mime) throw new Error("stored image is not JPEG or PNG");
          image = { data: Buffer.from(bytes).toString("base64"), mediaType: mime };
        }

        await setStage(id, "extracting");
        send({ event: "stage", data: { stage: "extracting" } });
        const outcome = await withUsage(async () => {
          const o = await extract(board, { image, text: sub.text_raw ?? undefined });
          return { value: o, inputTokens: o.usage.inputTokens, outputTokens: o.usage.outputTokens };
        });

        await setStage(id, "reconciling");
        send({ event: "stage", data: { stage: "reconciling" } });
        const reconcileStarted = performance.now();
        const written = await writeCardsForSubmission(board, sub, outcome.result, {
          decide: decideWithClaude(board, id),
        });
        const reconcileMs = Math.round(performance.now() - reconcileStarted);

        const flagged = outcome.result.facts.flatMap((f) => f.risk_flags);
        const heldReason = flagged.length ? Array.from(new Set(flagged)).join(",") : null;
        const isChatScreenshot = isImage && outcome.result.source_platform !== "paper";
        await finishSubmission(sub, {
          platform: outcome.result.source_platform,
          written,
          heldReason,
          deleteImage: isChatScreenshot,
        });
        send({
          event: "done",
          data: {
            status: written.publicIds.length === 0 && written.heldIds.length > 0 ? "held" : "done",
            card_ids: [...written.publicIds, ...written.heldIds],
            public_count: written.publicIds.length,
            held_count: written.heldIds.length,
            note_for_uploader: outcome.result.note_for_uploader,
            actions: written.decisions.map((d) => d.action),
            latency_ms: outcome.latencyMs,
            reconcile_ms: reconcileMs,
          },
        });
      } catch (err) {
        const { code, message } = classify(err);
        console.error(`process ${id} failed:`, code, message);
        await markFailed(id, `${code}: ${message}`).catch(() => undefined);
        send({ event: "failed", data: { error: code, message } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Reconcile through the budget guard. With no candidates there is no call
 * and nothing to count. If the call fails, the fact still reaches the board
 * as its own card: a duplicate is better than losing what a neighbour sent.
 */
function decideWithClaude(board: Board, submissionId: string): DecideFn {
  return async (fact, candidates): Promise<ReconcileDecision> => {
    try {
      const outcome =
        candidates.length === 0
          ? await reconcile(board, fact, candidates)
          : await withUsage(async () => {
              const o = await reconcile(board, fact, candidates);
              return { value: o, inputTokens: o.usage.inputTokens, outputTokens: o.usage.outputTokens };
            });
      const d = outcome.decision;
      console.log(
        `reconcile ${submissionId}: ${d.action} ${d.target_card_id ?? "-"} over ${candidates.length} candidates` +
          (outcome.model
            ? ` in ${outcome.latencyMs} ms on ${outcome.model}` +
              ` (tokens in ${outcome.usage.inputTokens}, cache read ${outcome.usage.cacheReadTokens},` +
              ` cache write ${outcome.usage.cacheWriteTokens}, out ${outcome.usage.outputTokens})`
            : "") +
          (outcome.override ? ` (code override: ${outcome.override})` : "") +
          `: ${d.reason}`,
      );
      return d;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`reconcile ${submissionId} failed, creating instead:`, message);
      return { action: "create", target_card_id: null, fill_missing: false, reason: `reconcile failed: ${message}` };
    }
  };
}

function classify(err: unknown): { code: string; message: string } {
  if (err instanceof BusyError) return { code: "busy", message: err.message };
  if (err instanceof ExtractError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: "generic", message: err.message };
  return { code: "generic", message: String(err) };
}

function sse(events: SseEvent[]): Response {
  const body = events.map(encodeSse).join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
