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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEVICE_RE = /^[0-9a-f-]{36}$/;
const ASKS_PER_MINUTE = 6;

// Best-effort limit per server instance. Questions are never stored, so there
// is no table to count them in; the daily Claude cap is the real budget guard.
const recent = new Map<string, number[]>();

function overAskLimit(key: string, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const times = (recent.get(key) ?? []).filter((at) => at > windowStart);
  const limited = times.length >= ASKS_PER_MINUTE;
  if (!limited) times.push(now);
  recent.set(key, times);
  if (recent.size > 5_000) {
    for (const [k, v] of recent) if (v.every((at) => at <= windowStart)) recent.delete(k);
  }
  return limited;
}

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
 * Errors: 400 bad_request, 404 board_not_found, 429 rate_limited,
 * 503 busy (daily Claude cap), 502 failed. The question is never stored or logged.
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

  const deviceId = typeof body.device_id === "string" && DEVICE_RE.test(body.device_id) ? body.device_id : null;
  const key = deviceId ?? `ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`;
  if (overAskLimit(key)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

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
