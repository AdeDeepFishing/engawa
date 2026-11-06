import { NextResponse, type NextRequest } from "next/server";
import {
  ask,
  AskError,
  MAX_HISTORY_ANSWER_CHARS,
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  noInformationAnswer,
  type AskTurn,
} from "@/lib/claude/ask";
import { BusyError, withUsage } from "@/lib/claude/usage";
import { getBoardBySlug, listPublicCards } from "@/lib/db/boards";
import { DEFAULT_LANG, isLang } from "@/lib/i18n";
import { isUuid } from "@/lib/ids";
import { clientIp, HOUR_MS, MINUTE_MS, overAny, rateLimited, slidingWindow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Questions are never stored, so there is no table to count them in: two
 * in-memory windows (lib/rate-limit.ts) per device, or per client address
 * for a request without a device id. Six a minute stops a burst; twenty an
 * hour stops a client that keeps asking all day. The device id is minted by
 * the client, so a third window per client address always applies as well:
 * sixty an hour, enough for a household or a classroom behind one address,
 * and it stops one script with a fresh device id per request from spending
 * the daily Claude call cap, which every board shares.
 */
const ASKS_PER_MINUTE = 6;
const ASKS_PER_HOUR = 20;
const ASKS_PER_IP_PER_HOUR = 60;
const asksPerMinute = slidingWindow(ASKS_PER_MINUTE, MINUTE_MS);
const asksPerHour = slidingWindow(ASKS_PER_HOUR, HOUR_MS);
const asksPerIp = slidingWindow(ASKS_PER_IP_PER_HOUR, HOUR_MS);

/**
 * Earlier question and answer pairs from the client, kept only when well
 * formed: at most MAX_HISTORY_TURNS, strings only, cut to the same limits as
 * a question and an answer. Anything else is ignored rather than refused, so
 * a stale client still gets an answer.
 */
function parseHistory(value: unknown): AskTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: AskTurn[] = [];
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const { question, answer } = item as { question?: unknown; answer?: unknown };
    if (typeof question !== "string" || typeof answer !== "string") continue;
    const q = question.trim().slice(0, MAX_QUESTION_CHARS);
    const a = answer.trim().slice(0, MAX_HISTORY_ANSWER_CHARS);
    if (q && a) turns.push({ question: q, answer: a });
  }
  return turns;
}

/**
 * Answers a question from the board's public cards.
 * Body: JSON {question, lang, device_id?, history?: [{question, answer}]}.
 * Response 200: {answer: {segments: [{text, cardIds}], cardIds, noInfo}}.
 * noInfo is true when the answer cites no card (nothing on the board), both
 * for the "no information yet" answer made without Claude and for a Claude
 * answer without citations; the client keeps those out of follow-ups.
 * Errors: 400 bad_request, 404 board_not_found, 429 rate_limited with
 * scope "device" (or "ip" without a device id) and limit_per_minute 6 or
 * limit_per_hour 20, or scope "ip" and limit_per_hour 60 for the address
 * window, Retry-After 60 or 3600, 503 busy (daily Claude cap),
 * 502 failed. The question is never stored or logged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  let body: { question?: unknown; lang?: unknown; device_id?: unknown; history?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const lang = isLang(body.lang) ? body.lang : DEFAULT_LANG;
  const history = parseHistory(body.history);

  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });

  const deviceId = isUuid(body.device_id) ? body.device_id.toLowerCase() : null;
  const ipKey = `ip:${clientIp(req) ?? "unknown"}`;
  const key = deviceId ?? ipKey;
  const full = overAny([
    [asksPerMinute, key],
    [asksPerHour, key],
    [asksPerIp, ipKey],
  ]);
  if (full) return rateLimited(deviceId && full !== asksPerIp ? "device" : "ip", full);

  const cards = await listPublicCards(board);
  if (cards.length === 0) {
    // Nothing to cite: answer in code, no Claude call and no usage bump.
    return NextResponse.json({ answer: noInformationAnswer(lang) }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const outcome = await withUsage((onUsage) => ask(board, cards, question, lang, { history, onUsage }));
    return NextResponse.json(
      { answer: outcome.answer },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BusyError) {
      return NextResponse.json({ error: "busy" }, { status: 503, headers: { "Retry-After": "3600" } });
    }
    // Log the failure kind only, never the question.
    console.error("ask failed:", err instanceof AskError ? err.code : err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
