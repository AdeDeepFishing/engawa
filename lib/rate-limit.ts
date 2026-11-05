/**
 * Sliding-window limits kept in this server instance's memory, shared by the
 * ask route and the reaction route. Best effort: each instance counts on its
 * own and a cold start forgets, which is acceptable for what they guard (a
 * runaway client, a script); the durable limits are database counts in the
 * routes that store rows, and the daily Claude call cap is the budget guard.
 * A key (a device id, or a client address) is held only while it has hits
 * inside the window, and is never stored or logged.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

/** Keys beyond which a hit also sweeps out keys with no hit left in the window. */
const SWEEP_AT = 5_000;

export interface SlidingWindow {
  readonly limit: number;
  readonly windowMs: number;
  /** Whether `key` already has `limit` hits inside the window. Records nothing. */
  full(key: string, now?: number): boolean;
  /** Records one hit for `key`. */
  hit(key: string, now?: number): void;
  /** `full`, and one hit when it was not: true means over the limit and nothing recorded. */
  over(key: string, now?: number): boolean;
}

export function slidingWindow(limit: number, windowMs: number): SlidingWindow {
  const recent = new Map<string, number[]>();
  const live = (key: string, now: number) => (recent.get(key) ?? []).filter((at) => at > now - windowMs);

  const full = (key: string, now = Date.now()) => live(key, now).length >= limit;
  const hit = (key: string, now = Date.now()) => {
    recent.set(key, [...live(key, now), now]);
    if (recent.size > SWEEP_AT) {
      for (const [k, times] of recent) if (times.every((at) => at <= now - windowMs)) recent.delete(k);
    }
  };
  return {
    limit,
    windowMs,
    full,
    hit,
    over(key, now = Date.now()) {
      if (full(key, now)) return true;
      hit(key, now);
      return false;
    },
  };
}

/**
 * Checks several windows for one request and records a hit in each only when
 * none is full, so a request refused by one window does not use up another.
 * Returns the first full window, or null.
 */
export function overAny(checks: readonly [SlidingWindow, string][], now = Date.now()): SlidingWindow | null {
  const blocked = checks.find(([w, key]) => w.full(key, now));
  if (blocked) return blocked[0];
  for (const [w, key] of checks) w.hit(key, now);
  return null;
}

/** The client address as the platform reports it (Vercel sets x-forwarded-for), or null when there is none. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

/**
 * The 429 every in-memory limit answers with: `{error: "rate_limited", scope,
 * limit_per_minute | limit_per_hour}`, `Retry-After` set to the window, and
 * no-store. The client picks its message from the scope and the window.
 */
export function rateLimited(scope: "device" | "ip", window: SlidingWindow): Response {
  const perHour = window.windowMs >= HOUR_MS;
  return Response.json(
    { error: "rate_limited", scope, [perHour ? "limit_per_hour" : "limit_per_minute"]: window.limit },
    {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": String(Math.ceil(window.windowMs / 1000)) },
    },
  );
}
