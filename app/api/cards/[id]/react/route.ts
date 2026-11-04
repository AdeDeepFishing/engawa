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
import { clientIp, HOUR_MS, rateLimited, slidingWindow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Taps one address may send in an hour, across devices and cards. */
const REACTIONS_PER_IP_PER_HOUR = 60;

/**
 * Two in-memory windows (lib/rate-limit.ts): every tap, set or taken back,
 * per device, which stops one browser from toggling a card hundreds of
 * times; and every tap per client address, which stops a script that mints
 * a new device id for each tap. The durable limit is the row count in the
 * table (recentReactionCount), which holds across instances.
 */
const tapsPerDevice = slidingWindow(REACTIONS_PER_DEVICE_PER_HOUR, HOUR_MS);
const tapsPerIp = slidingWindow(REACTIONS_PER_IP_PER_HOUR, HOUR_MS);

const noStore = { "Cache-Control": "no-store" };

type Parsed = { cardId: string; deviceId: string; body: Record<string, unknown> } | Response;

/**
 * Shared checks of POST and DELETE: the per-address limit first (before any
 * database read), then a well-formed card id and a device id in a JSON body.
 */
async function parse(req: NextRequest, params: Promise<{ id: string }>): Promise<Parsed> {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  const ip = clientIp(req);
  if (ip && tapsPerIp.over(ip)) return rateLimited("ip", tapsPerIp);
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
  if (tapsPerDevice.over(deviceId)) return rateLimited("device", tapsPerDevice);
  if ((await recentReactionCount(deviceId)) >= REACTIONS_PER_DEVICE_PER_HOUR) return rateLimited("device", tapsPerDevice);

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
  if (tapsPerDevice.over(deviceId)) return rateLimited("device", tapsPerDevice);

  await removeReaction(card.id, deviceId);
  return Response.json(await countsFor(card.id), { headers: noStore });
}
