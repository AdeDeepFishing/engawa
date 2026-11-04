import { type NextRequest } from "next/server";
import { isReactionKind } from "@/lib/cards/reactions";
import { hasDb } from "@/lib/db/client";
import {
  countsFor,
  getReactableCard,
  recentReactionCount,
  REACTIONS_PER_DEVICE_PER_HOUR,
  removeReaction,
  setReaction,
} from "@/lib/db/reactions";
import { isUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Taps one address may send in an hour, across devices and cards. */
const REACTIONS_PER_IP_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

/**
 * Sliding one hour window per key on this server instance, the same
 * best-effort pattern as the ask limit. Two windows use it: every tap, set or
 * taken back, per device, which stops one browser from toggling a card
 * hundreds of times; and every tap per client address, which stops a script
 * that mints a new device id for each tap. No address is stored or logged:
 * the window lives in memory and holds the address only while it has taps in
 * the last hour. The durable limit is the row count in the table
 * (recentReactionCount), which holds across instances.
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

const overTapLimit = windowLimiter(REACTIONS_PER_DEVICE_PER_HOUR);
const overIpLimit = windowLimiter(REACTIONS_PER_IP_PER_HOUR);

/** The client address as the platform reports it (Vercel sets x-forwarded-for), or null when there is none. */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

const noStore = { "Cache-Control": "no-store" };

function rateLimited(scope: "device" | "ip") {
  const limit = scope === "ip" ? REACTIONS_PER_IP_PER_HOUR : REACTIONS_PER_DEVICE_PER_HOUR;
  return Response.json(
    { error: "rate_limited", scope, limit_per_hour: limit },
    { status: 429, headers: { ...noStore, "Retry-After": "3600" } },
  );
}

type Parsed = { cardId: string; deviceId: string; body: Record<string, unknown> } | Response;

/**
 * Shared checks of POST and DELETE: the per-address limit first (before any
 * database read), then a well-formed card id and a device id in a JSON body.
 */
async function parse(req: NextRequest, params: Promise<{ id: string }>): Promise<Parsed> {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  const ip = clientIp(req);
  if (ip && overIpLimit(ip)) return rateLimited("ip");
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !isUuid(body.device_id)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return { cardId: id, deviceId: body.device_id.toLowerCase(), body };
}

/**
 * A reader's one tap on a public card (N6). Body: JSON {device_id, kind}
 * with kind "still_true" or "no_longer_true". One reaction per device per
 * card: a second POST replaces the first. "still_true" moves the card's
 * last_confirmed_at to now. Response 200: {still_true, no_longer_true}, the
 * card's new counts and nothing else.
 * Errors: 400 bad_request, 404 not_found (unknown, held or hidden card),
 * 429 rate_limited with scope "device" (over 30 reactions a device in an
 * hour) or "ip" (over 60 taps from one address in an hour), Retry-After
 * 3600, 503 no_database. Device ids and addresses are never logged or returned.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parse(req, params);
  if (parsed instanceof Response) return parsed;
  const { cardId, deviceId, body } = parsed;
  if (!isReactionKind(body.kind)) return Response.json({ error: "bad_request" }, { status: 400 });

  const card = await getReactableCard(cardId);
  if (!card) return Response.json({ error: "not_found" }, { status: 404 });
  if (overTapLimit(deviceId)) return rateLimited("device");
  if ((await recentReactionCount(deviceId)) >= REACTIONS_PER_DEVICE_PER_HOUR) return rateLimited("device");

  await setReaction(card, deviceId, body.kind);
  return Response.json(await countsFor(card.id), { headers: noStore });
}

/** Takes the device's reaction back. Body: JSON {device_id}. Same answers as POST. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parse(req, params);
  if (parsed instanceof Response) return parsed;
  const { cardId, deviceId } = parsed;

  const card = await getReactableCard(cardId);
  if (!card) return Response.json({ error: "not_found" }, { status: 404 });
  if (overTapLimit(deviceId)) return rateLimited("device");

  await removeReaction(card.id, deviceId);
  return Response.json(await countsFor(card.id), { headers: noStore });
}
