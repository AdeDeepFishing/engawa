import { type NextRequest } from "next/server";
import { ADMIN_ACTIONS, ADMIN_API_COOKIE, applyAdminAction, isAdminCookie, type AdminAction } from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Admin writes for one board. Body: JSON {card_id, action} with action
 * publish, hide, confirm_official or unconfirm_official. The caller is
 * authenticated by the admin cookie the entry link set (see admin/enter);
 * the token itself never travels here. This route is the only place
 * official_confirmed can be set.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  if (!isAdminCookie(req.cookies.get(ADMIN_API_COOKIE)?.value)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { card_id?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });
  const action = body.action;
  const cardId = body.card_id;
  if (typeof action !== "string" || !(ADMIN_ACTIONS as readonly string[]).includes(action)) {
    return Response.json({ error: "bad_action" }, { status: 400 });
  }
  if (typeof cardId !== "string" || !UUID_RE.test(cardId)) {
    return Response.json({ error: "bad_card_id" }, { status: 400 });
  }
  const card = await applyAdminAction(board, cardId, action as AdminAction);
  if (!card) return Response.json({ error: "card_not_found" }, { status: 404 });
  console.log(`admin ${slug}: ${action} ${cardId}`);
  return Response.json({ card }, { headers: { "Cache-Control": "no-store" } });
}
