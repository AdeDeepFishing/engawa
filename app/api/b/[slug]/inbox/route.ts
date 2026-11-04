import { type NextRequest } from "next/server";
import { assertUnderCap, BusyError } from "@/lib/claude/usage";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import {
  getInboxConfig,
  INBOX_DEVICE_ID,
  INBOX_LIMIT_PER_HOUR,
  inboxMailsLastHour,
  inboxSecretMatches,
} from "@/lib/db/inbox";
import { claimForProcessing, createSubmission } from "@/lib/db/submissions";
import { mailText, senderAddress, senderDomain } from "@/lib/inbox/clean";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY_BYTES = 20 * 1024;
/** A received_at older than this, or in the future beyond the skew, is ignored and the time of the request is used. */
const MAX_RECEIVED_AGE_MS = 24 * 3_600_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * The official inbox (docs/INBOX.md). A mail forwarder posts the city's
 * broadcast mail here as JSON {from, subject, text, received_at?} with the
 * board's inbox secret in `Authorization: Bearer <secret>`. The route runs
 * the whole pipeline before it answers (extract, reconcile, translate),
 * with the text marked as official mail, and answers with the card ids.
 *
 * Checks, in this order, each answered with a stable code:
 *   403 forbidden          no inbox secret on the board, or a wrong one
 *   413 too_large          body over 20 KB (header or actual size)
 *   400 bad_request        not JSON, or from, subject or text missing
 *   403 sender_not_allowed from is not on the board's list (logged with the domain only)
 *   429 rate_limited       60 accepted mails on this board in the last hour, Retry-After 3600
 *   503 busy               daily Claude call cap reached, Retry-After 3600
 *   422 empty              nothing left after the signature and footer were removed
 *   500 <code>             the pipeline failed (extract error codes, generic)
 *   201                    {submission_id, status, card_ids, public_count, held_count, actions,
 *                           switched_to_disaster}
 * A mail is stored as a text submission with source_hint 'official' and the
 * device id "inbox"; its raw text is cleared when processing finishes, as
 * for every submission.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });

  const config = await getInboxConfig(board.id);
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!config || !inboxSecretMatches(bearer, config.secretHash)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return tooLarge();
  let body: { from?: unknown; subject?: unknown; text?: unknown; received_at?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) return Response.json({ error: "bad_request" }, { status: 400 });
  const { from, subject, text } = body;
  if (typeof from !== "string" || typeof subject !== "string" || typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const sender = senderAddress(from);
  if (!sender || !config.senders.includes(sender)) {
    console.warn(`inbox ${slug}: refused a mail from a sender not on the list (domain ${senderDomain(from)})`);
    return Response.json({ error: "sender_not_allowed" }, { status: 403 });
  }

  if ((await inboxMailsLastHour(board.id)) >= INBOX_LIMIT_PER_HOUR) {
    console.warn(`inbox ${slug}: rate limited (${INBOX_LIMIT_PER_HOUR} mails in the last hour)`);
    return Response.json(
      { error: "rate_limited", limit_per_hour: INBOX_LIMIT_PER_HOUR },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  try {
    await assertUnderCap();
  } catch (e) {
    if (e instanceof BusyError) {
      return Response.json({ error: "busy" }, { status: 503, headers: { "Retry-After": "3600" } });
    }
    throw e;
  }

  const cleaned = mailText(subject, text);
  if (!cleaned.trim()) return Response.json({ error: "empty" }, { status: 422 });

  const sub = await createSubmission({
    boardId: board.id,
    deviceId: INBOX_DEVICE_ID,
    inputKind: "text",
    text: cleaned,
    sourceHint: "official",
  });
  if (!(await claimForProcessing(sub.id, "extracting"))) {
    return Response.json({ error: "already_processing", submission_id: sub.id }, { status: 409 });
  }
  const started = performance.now();
  const result = await runPipeline(board, sub, () => undefined, { extractNow: receivedAt(body.received_at) });
  const totalMs = Math.round(performance.now() - started);
  if (!result.ok) {
    const status = result.error === "busy" ? 503 : 500;
    return Response.json({ error: result.error, submission_id: sub.id }, { status });
  }
  const d = result.done;
  console.log(`inbox ${slug}: ${sub.id} ${d.actions.join(",") || "no facts"} in ${totalMs} ms`);
  return Response.json(
    {
      submission_id: sub.id,
      status: d.status,
      card_ids: d.card_ids,
      public_count: d.public_count,
      held_count: d.held_count,
      actions: d.actions,
      switched_to_disaster: d.switched_to_disaster,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function tooLarge() {
  return Response.json({ error: "too_large", max_bytes: MAX_BODY_BYTES }, { status: 413 });
}

/**
 * The time the mail was received, as the reference for "today" and "15時"
 * in the text, when the forwarder sent a plausible one. A mail forwarded
 * late still means the day it was broadcast.
 */
function receivedAt(value: unknown, now = new Date()): Date | undefined {
  if (typeof value !== "string") return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  if (t > now.getTime() + MAX_CLOCK_SKEW_MS || t < now.getTime() - MAX_RECEIVED_AGE_MS) return undefined;
  return new Date(t);
}
