import { type NextRequest } from "next/server";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { deleteSubscription, saveSubscription } from "@/lib/db/push";
import { isUuid } from "@/lib/ids";
import { isLang } from "@/lib/i18n";
import { vapid } from "@/lib/push/config";
import { isPushEndpoint, validKeys } from "@/lib/push/rules";
import type { Board } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Subscribe and unsubscribe requests one device may send in an hour, across boards. */
const PUSH_PER_DEVICE_PER_HOUR = 20;
/** Requests one address may send in an hour, across devices and boards. */
const PUSH_PER_IP_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

/**
 * Sliding one hour window per key on this server instance, the pattern of
 * the react route: per device, and per client address so a script that mints
 * a device id per request is held too. No address is stored or logged. The
 * durable bound is the cap of subscriptions per board (lib/db/push.ts).
 */
function windowLimiter(limit: number) {
  const recent = new Map<string, number[]>();
  return function over(key: string, now = Date.now()): boolean {
    const windowStart = now - HOUR_MS;
    const times = (recent.get(key) ?? []).filter((at) => at > windowStart);
    const limited = times.length >= limit;
    if (!limited) times.push(now);
    recent.set(key, times);
    if (recent.size > 5_000) {
      for (const [k, v] of recent) if (v.every((at) => at <= windowStart)) recent.delete(k);
    }
    return limited;
  };
}

const overDeviceLimit = windowLimiter(PUSH_PER_DEVICE_PER_HOUR);
const overIpLimit = windowLimiter(PUSH_PER_IP_PER_HOUR);

/** The client address as the platform reports it (Vercel sets x-forwarded-for), or null when there is none. */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

const noStore = { "Cache-Control": "no-store" };

function fail(error: string, status: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return Response.json({ error, ...extra }, { status, headers: { ...noStore, ...headers } });
}

function rateLimited(scope: "device" | "ip") {
  const limit = scope === "ip" ? PUSH_PER_IP_PER_HOUR : PUSH_PER_DEVICE_PER_HOUR;
  return fail("rate_limited", 429, { scope, limit_per_hour: limit }, { "Retry-After": "3600" });
}

/** Push is off: no VAPID keys, or migration 0010 not applied. The board hides "Get alerts" on this answer. */
const notConfigured = () => fail("not_configured", 404);

type Parsed = { board: Board; deviceId: string; body: Record<string, unknown> } | Response;

/**
 * Shared checks of POST and DELETE: the per-address limit first (before any
 * database read), push configured, the board, a JSON body with a device id,
 * then the per-device limit.
 */
async function parse(req: NextRequest, params: Promise<{ slug: string }>): Promise<Parsed> {
  if (!hasDb()) return fail("no_database", 503);
  const ip = clientIp(req);
  if (ip && overIpLimit(ip)) return rateLimited("ip");
  if (!vapid()) return notConfigured();
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return fail("board_not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("bad_request", 400);
  }
  if (!body || typeof body !== "object" || !isUuid(body.device_id)) return fail("bad_request", 400);
  const deviceId = body.device_id.toLowerCase();
  if (overDeviceLimit(deviceId)) return rateLimited("device");
  return { board, deviceId, body };
}

/**
 * Turns alerts on for this board on this device, or refreshes them (the
 * board page confirms an alert that is on at most once a day, and when the
 * reader's language changes). Body: JSON {device_id, lang, subscription}
 * with subscription as PushSubscription.toJSON() gives it: {endpoint, keys:
 * {p256dh, auth}}. The endpoint must belong to a browser's push service
 * (lib/push/rules.ts isPushEndpoint). Answer 200 {subscribed: true}.
 * Errors: 400 bad_request, 404 board_not_found, 404 not_configured (push is
 * off: the control hides), 409 board_full (MAX_SUBSCRIPTIONS_PER_BOARD),
 * 429 rate_limited with scope "device" or "ip" and Retry-After 3600,
 * 503 no_database. Nothing is returned or logged about the subscription.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = await parse(req, params);
  if (parsed instanceof Response) return parsed;
  const { board, deviceId, body } = parsed;
  const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null | undefined;
  if (!isLang(body.lang) || !sub || typeof sub !== "object" || !isPushEndpoint(sub.endpoint)) return fail("bad_request", 400);
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!validKeys(p256dh, auth)) return fail("bad_request", 400);

  const outcome = await saveSubscription({
    boardId: board.id,
    deviceId,
    endpoint: sub.endpoint,
    p256dh: p256dh as string,
    auth: auth as string,
    lang: body.lang,
  });
  if (outcome === "missing") return notConfigured();
  if (outcome === "full") return fail("board_full", 409);
  return Response.json({ subscribed: true }, { headers: noStore });
}

/**
 * Turns alerts off for this board on this device. Body: JSON {device_id,
 * endpoint}. Answer 200 {subscribed: false} whether or not a row was there,
 * so a second tap or a row the push service already dropped is no error.
 * Errors as POST.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = await parse(req, params);
  if (parsed instanceof Response) return parsed;
  const { board, body } = parsed;
  if (!isPushEndpoint(body.endpoint)) return fail("bad_request", 400);
  const removed = await deleteSubscription(board.id, body.endpoint);
  if (removed === "missing") return notConfigured();
  return Response.json({ subscribed: false }, { headers: noStore });
}
