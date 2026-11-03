import { type NextRequest } from "next/server";
import { extract, ExtractError } from "@/lib/claude/extract";
import { MaskError } from "@/lib/claude/mask";
import { reconcile, type ReconcileDecision } from "@/lib/claude/reconcile";
import { translate, type TranslateItem, type TranslateLang } from "@/lib/claude/translate";
import { BusyError, withUsage } from "@/lib/claude/usage";
import { hasDb } from "@/lib/db/client";
import { fillCardLanguages, listCardsMissingLanguages, type FillOutcome } from "@/lib/db/translate";
import { getBoardById } from "@/lib/db/boards";
import { attachMaskedImage, cardsWithoutMaskedImage, removeMaskedImage, uploadMaskedImage } from "@/lib/db/masked";
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
import { isChatPlatform, type Board } from "@/lib/types";
import { maskingEnabled, maskScreenshot, type MaskedScreenshot } from "@/lib/image/mask-pipeline";
import { sniffImage, type StrippableMime } from "@/lib/image/strip";
import { encodeSse, type SseEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs the pipeline for one submission while the uploader keeps the
 * connection open, streaming stage events as server-sent events:
 *   stage  {stage}            stripping (images only), extracting, masking (chat screenshots,
 *                            when enabled), reconciling, translating
 *   cards  {status, card_ids, public_count, held_count, actions}
 *                            the cards are on the board, in Japanese, English and the input's
 *                            language; the client refreshes its list on this event
 *   done   {status, card_ids, public_count, held_count, note_for_uploader,
 *           actions, latency_ms, reconcile_ms, translate_ms, translated, masked}
 *   failed {error, message}
 * `actions` has one reconcile action per fact (create, merge, update, conflict, hold).
 * `translated` is true when every written card has all six languages at the end.
 * `masked` is true when a masked copy of a chat screenshot was stored on the cards.
 * Body: JSON {device_id}. The device must match the submission.
 *
 * Extract writes three languages so the card shows sooner; the other three
 * come from one translate call after the submission is finished (status
 * done, cards recorded), so a translate that fails or is cut off leaves a
 * finished submission with a card that readers see with English or Japanese
 * in place of the missing languages, and the next drop-in on the board fills
 * it (the sweep below). The translation state lives on the cards, not on
 * the submission row.
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
        let image: { data: string; mediaType: StrippableMime } | undefined;
        let stored: { bytes: Uint8Array; mime: StrippableMime } | undefined;
        if (isImage) {
          // Text submissions have no image to prepare, so they skip this stage.
          send({ event: "stage", data: { stage: "stripping" } });
          const bytes = await downloadSubmissionImage(sub);
          if (!bytes) throw new Error("image missing");
          const mime = sniffImage(bytes);
          if (!mime) throw new Error("stored image is not JPEG or PNG");
          stored = { bytes, mime };
          image = { data: Buffer.from(bytes).toString("base64"), mediaType: mime };
        }

        await setStage(id, "extracting");
        send({ event: "stage", data: { stage: "extracting" } });
        const outcome = await withUsage(async () => {
          const o = await extract(board, { image, text: sub.text_raw ?? undefined });
          return { value: o, inputTokens: o.usage.inputTokens, outputTokens: o.usage.outputTokens };
        });

        const flagged = outcome.result.facts.flatMap((f) => f.risk_flags);
        const heldReason = flagged.length ? Array.from(new Set(flagged)).join(",") : null;

        // Masking (G1) runs beside reconcile: it needs only the image and the
        // platform, and a failure never blocks the card. A screenshot that
        // produced any flagged fact (sensitive_personal among them) gets no
        // masked copy at all, not even for its public sibling cards.
        let masking: Promise<MaskedScreenshot | null> | null = null;
        if (stored && flagged.length === 0 && isChatPlatform(outcome.result.source_platform) && maskingEnabled()) {
          await setStage(id, "masking");
          send({ event: "stage", data: { stage: "masking" } });
          masking = maskWithoutBlocking(id, stored.bytes, stored.mime);
        }

        await setStage(id, "reconciling");
        send({ event: "stage", data: { stage: "reconciling" } });
        const reconcileStarted = performance.now();
        const written = await writeCardsForSubmission(board, sub, outcome.result, {
          decide: decideWithClaude(board, id),
          extractModel: outcome.model,
        });
        const reconcileMs = Math.round(performance.now() - reconcileStarted);

        // The masked copy is stored only for written cards that have none yet
        // (a merge into an already masked card, or no card at all, stores
        // nothing), and an object that ends up on no card is removed at once,
        // so every masked object is always listed on a card and purged with it.
        let maskedPath: string | null = null;
        const masked = masking ? await masking : null;
        if (masked) {
          let uploaded: string | null = null;
          try {
            const targets = await cardsWithoutMaskedImage([...written.publicIds, ...written.heldIds]);
            if (targets.length > 0) {
              uploaded = await uploadMaskedImage(board.id, id, masked.bytes, masked.mime);
              const attached = await attachMaskedImage(targets, uploaded);
              if (attached > 0) maskedPath = uploaded;
              else console.warn(`masking ${id}: no card took the masked copy, removing it`);
            } else {
              console.log(`masking ${id}: every written card already has a masked copy, nothing stored`);
            }
          } catch (err) {
            console.error(`masking ${id}: storing the masked copy failed:`, err instanceof Error ? err.message : String(err));
            maskedPath = null;
          }
          if (uploaded && !maskedPath) await removeMaskedImage(uploaded);
        }

        const isChatScreenshot = isImage && outcome.result.source_platform !== "paper";
        await finishSubmission(sub, {
          platform: outcome.result.source_platform,
          written,
          heldReason,
          deleteImage: isChatScreenshot,
        });
        const cardIds = [...written.publicIds, ...written.heldIds];
        const summary = {
          status: written.publicIds.length === 0 && written.heldIds.length > 0 ? "held" : "done",
          card_ids: cardIds,
          public_count: written.publicIds.length,
          held_count: written.heldIds.length,
          actions: written.decisions.map((d) => d.action),
        };
        send({ event: "cards", data: summary });

        // The other languages, after the card is already visible. The sweep
        // adds a few older cards of this board still waiting for theirs.
        let fill: FillOutcome | null = null;
        let translateMs = 0;
        if (cardIds.length > 0) {
          send({ event: "stage", data: { stage: "translating" } });
          const translateStarted = performance.now();
          const older = await listCardsMissingLanguages(board.id, SWEEP_LIMIT, cardIds).catch((err: unknown) => {
            console.error(`translate ${id}: listing older cards failed:`, err instanceof Error ? err.message : String(err));
            return [] as string[];
          });
          fill = await translateWithRetry(board, id, [...cardIds, ...older]);
          translateMs = Math.round(performance.now() - translateStarted);
          if (fill) {
            console.log(
              `translate ${id}: ${fill.langs.join(",")} on ${fill.filled.length} cards` +
                (older.length ? ` (${older.length} older)` : "") +
                (fill.skipped.length ? `, ${fill.skipped.length} skipped` : "") +
                ` in ${fill.latencyMs} ms on ${fill.model}` +
                ` (tokens in ${fill.usage.inputTokens}, cache read ${fill.usage.cacheReadTokens},` +
                ` cache write ${fill.usage.cacheWriteTokens}, out ${fill.usage.outputTokens})`,
            );
          }
        }
        send({
          event: "done",
          data: {
            ...summary,
            note_for_uploader: outcome.result.note_for_uploader,
            latency_ms: outcome.latencyMs,
            reconcile_ms: reconcileMs,
            translate_ms: translateMs,
            translated: cardIds.every((c) => !fill || !fill.skipped.includes(c)) && (fill !== null || cardIds.length === 0 || (await allTranslated(board, cardIds))),
            masked: maskedPath !== null,
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
      return { action: "create", target_card_id: null, fill_missing: false, reason: `reconcile failed: ${message}`, model: null };
    }
  };
}

/**
 * Masks a chat screenshot through the budget guard. Any failure (refusal,
 * invalid answer, too many boxes, API error, daily cap) is logged by kind
 * and the card continues without a masked copy: nothing is stored.
 */
async function maskWithoutBlocking(
  submissionId: string,
  bytes: Uint8Array,
  mime: StrippableMime,
): Promise<MaskedScreenshot | null> {
  try {
    const masked = await withUsage(async () => {
      const m = await maskScreenshot(bytes, mime);
      return { value: m, inputTokens: m.outcome.usage.inputTokens, outputTokens: m.outcome.usage.outputTokens };
    });
    const o = masked.outcome;
    console.log(
      `masking ${submissionId}: ${masked.boxes.length} boxes (${masked.drawn.length} drawn) in ${o.latencyMs} ms on ${o.model}` +
        ` (tokens in ${o.usage.inputTokens}, cache read ${o.usage.cacheReadTokens}, out ${o.usage.outputTokens})` +
        (o.dropped ? `, ${o.dropped} dropped` : "") +
        (o.rescaledFrom ? `, rescaled from ${o.rescaledFrom.width}x${o.rescaledFrom.height}` : ""),
    );
    return masked;
  } catch (err) {
    const kind =
      err instanceof MaskError ? err.code : err instanceof BusyError ? "busy" : err instanceof Error ? err.name : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`masking ${submissionId} failed (${kind}), the card continues without a masked copy:`, message);
    return null;
  }
}

/** Older cards of the board filled in the same call as the submission's own; keeps one drop-in's work bounded. */
const SWEEP_LIMIT = 3;

/**
 * Fills the missing languages of the given cards through the budget guard,
 * trying twice: a refusal, an invalid answer or an API error on the first
 * try is logged and the call is made once more. Over the daily cap there is
 * no second try. Any failure leaves the cards as they are: the uploader has
 * their card already, readers see a fallback language, and the next drop-in
 * on the board fills what is missing.
 */
async function translateWithRetry(board: Board, submissionId: string, cardIds: string[]): Promise<FillOutcome | null> {
  const translator = (items: TranslateItem[], langs: readonly TranslateLang[]) =>
    withUsage(async () => {
      const o = await translate(board, items, langs);
      return { value: o, inputTokens: o.usage.inputTokens, outputTokens: o.usage.outputTokens };
    });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fillCardLanguages(board, cardIds, { translator });
    } catch (err) {
      const kind = err instanceof BusyError ? "busy" : err instanceof Error ? err.name : "unknown";
      const message = err instanceof Error ? err.message : String(err);
      console.error(`translate ${submissionId} attempt ${attempt} failed (${kind}), cards keep their fallback languages:`, message);
      if (err instanceof BusyError) break;
    }
  }
  return null;
}

/** Whether every card named still lacks nothing (used when no call was needed or the call failed). */
async function allTranslated(board: Board, cardIds: string[]): Promise<boolean> {
  try {
    const missing = await listCardsMissingLanguages(board.id, cardIds.length, []);
    return cardIds.every((c) => !missing.includes(c));
  } catch {
    return false;
  }
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
