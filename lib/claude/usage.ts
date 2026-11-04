import { db, hasDb } from "@/lib/db/client";

export class BusyError extends Error {
  constructor() {
    super("daily Claude call cap reached");
    this.name = "BusyError";
  }
}

/** Calendar day in Japan, the unit of the daily cap. */
export function jstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function cap(): number {
  const n = Number(process.env.DAILY_CLAUDE_CALL_CAP ?? 400);
  return Number.isFinite(n) && n > 0 ? n : 400;
}

/** Throws BusyError when today's call count has reached DAILY_CLAUDE_CALL_CAP. */
export async function assertUnderCap(): Promise<void> {
  if (!hasDb()) return;
  const { data, error } = await db()
    .from("usage_daily")
    .select("claude_calls")
    .eq("day", jstDay())
    .maybeSingle();
  if (error) throw error;
  if ((data?.claude_calls ?? 0) >= cap()) throw new BusyError();
}

/** Records one call and its token counts. Never throws: a failed counter must not fail the pipeline. */
export async function recordUsage(inputTokens: number, outputTokens: number): Promise<void> {
  if (!hasDb()) return;
  const { error } = await db().rpc("bump_usage", {
    p_day: jstDay(),
    p_in: inputTokens,
    p_out: outputTokens,
  });
  if (error) console.error("bump_usage failed", error.message);
}

/** Token counts of one response. */
export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Told the token counts of each response the moment it is back, before any
 * check of its content can throw. The call wrappers in this folder take it
 * as `onUsage`.
 */
export type UsageMeter = (counts: TokenCounts) => void;

/**
 * Budget guard around Claude calls: refuses with BusyError over the daily
 * cap, then runs `fn`, which hands the meter to the call it makes. Every
 * response the meter was told about is counted in `finally`, so a response
 * that the caller's validation rejects (not JSON, a refusal, a phone number
 * in the output) still counts toward DAILY_CLAUDE_CALL_CAP, and a retry
 * after it counts again. An API error before any response reports nothing
 * and records nothing.
 */
export async function withUsage<T>(fn: (meter: UsageMeter) => Promise<T>): Promise<T> {
  await assertUnderCap();
  const responses: TokenCounts[] = [];
  try {
    return await fn((counts) => {
      responses.push(counts);
    });
  } finally {
    for (const c of responses) await recordUsage(c.inputTokens, c.outputTokens);
  }
}
