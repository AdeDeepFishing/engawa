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

/**
 * Budget guard around a Claude call. The call returns its token usage so the
 * counter can be bumped afterwards.
 */
export async function withUsage<T>(
  fn: () => Promise<{ value: T; inputTokens: number; outputTokens: number }>,
): Promise<T> {
  await assertUnderCap();
  const { value, inputTokens, outputTokens } = await fn();
  await recordUsage(inputTokens, outputTokens);
  return value;
}
