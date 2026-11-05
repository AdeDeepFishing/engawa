import { after, type NextRequest } from "next/server";
import { hasDb } from "@/lib/db/client";
import { getBoardById } from "@/lib/db/boards";
import { claimForProcessing, getSubmission } from "@/lib/db/submissions";
import { runPipeline } from "@/lib/pipeline";
import { isUuid } from "@/lib/ids";
import { encodeSse, type SseEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs the pipeline for one submission while the uploader keeps the
 * connection open, streaming stage events as server-sent events. The steps
 * and the events (stage, cards, done, failed) are described in
 * lib/pipeline.ts, which the official inbox route shares.
 * `actions` has one reconcile action per fact (create, merge, update, conflict, hold).
 * `translated` is true when every written card has all six languages at the end.
 * `masked` is true when a masked copy of a chat screenshot was stored on the cards.
 * Body: JSON {device_id}. The device must match the submission.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
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
  // A mail from the official inbox is run by the inbox route only, never from a browser.
  if (sub.source_hint) return Response.json({ error: "forbidden" }, { status: 403 });
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

  // The run belongs to the submission, not to the socket: when the uploader
  // switches apps, reloads or closes the tab, the stream is cancelled, sends
  // become no-ops and extract, write and translate still finish (after()
  // keeps the function alive until they do). The board's next poll shows
  // the cards.
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: SseEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          open = false;
        }
      };
      const run = runPipeline(board, sub, send).finally(() => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      });
      after(
        run.then(
          () => undefined,
          (err: unknown) => console.error(`process ${sub.id}: run threw:`, err instanceof Error ? err.message : String(err)),
        ),
      );
    },
    cancel() {
      open = false;
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

function sse(events: SseEvent[]): Response {
  const body = events.map(encodeSse).join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
