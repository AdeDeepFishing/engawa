import { type NextRequest } from "next/server";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { pushStoreReady } from "@/lib/db/push";
import { vapid } from "@/lib/push/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The public VAPID key the browser subscribes with, so no build bundles it
 * and a key change needs no deploy of the client. Answer 200 {key}. 404
 * not_configured when push is off (no VAPID keys, or migration 0010 not
 * applied): the board's "Get alerts" control then stays hidden. 404
 * board_not_found for an unknown board.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const noStore = { "Cache-Control": "no-store" };
  const keys = vapid();
  if (!keys || !hasDb()) return Response.json({ error: "not_configured" }, { status: 404, headers: noStore });
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404, headers: noStore });
  if (!(await pushStoreReady())) return Response.json({ error: "not_configured" }, { status: 404, headers: noStore });
  return Response.json({ key: keys.publicKey }, { headers: { "Cache-Control": "private, max-age=300" } });
}
