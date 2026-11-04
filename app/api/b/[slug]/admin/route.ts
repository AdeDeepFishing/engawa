import { type NextRequest } from "next/server";
import {
  ADMIN_ACTIONS,
  ADMIN_API_COOKIE,
  AdminActionError,
  applyAdminAction,
  isAdminCookie,
  type AdminAction,
} from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { switchModeByAdmin, toModeView } from "@/lib/db/mode";
import { isUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin writes for one board. Body: JSON {card_id, action} with action
 * publish, hide, hide_as_duplicate (plus target_card_id, a public card of
 * the same board), confirm_official or unconfirm_official. The caller is
 * authenticated by the admin cookie the entry link set (see admin/enter);
 * the token itself never travels here. This route is the only place
 * official_confirmed can be set. A refused duplicate target answers 409
 * with the reason (same_card, target_not_found, target_not_public).
 *
 * Board mode (N21): {action: "set_mode", mode: "peace" | "disaster"} sets
 * the mode wanted, with the reason `admin`, and answers {mode, changed}:
 * the mode as the admin page shows it (kind of reason, never a submission
 * id) and whether this request changed it. Asking for the mode the board is
 * already in changes nothing, so a second tap is harmless.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  if (!isAdminCookie(req.cookies.get(ADMIN_API_COOKIE)?.value)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { card_id?: unknown; action?: unknown; target_card_id?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });
  if (body.action === "set_mode") {
    if (body.mode !== "peace" && body.mode !== "disaster") return Response.json({ error: "bad_mode" }, { status: 400 });
    // writeMode logs the change itself, with the board slug only.
    const { state, changed } = await switchModeByAdmin(board, body.mode);
    return Response.json({ mode: toModeView(state), changed }, { headers: { "Cache-Control": "no-store" } });
  }
  const action = body.action;
  const cardId = body.card_id;
  if (typeof action !== "string" || !(ADMIN_ACTIONS as readonly string[]).includes(action)) {
    return Response.json({ error: "bad_action" }, { status: 400 });
  }
  if (!isUuid(cardId)) {
    return Response.json({ error: "bad_card_id" }, { status: 400 });
  }
  const targetCardId = body.target_card_id;
  if (action === "hide_as_duplicate" && !isUuid(targetCardId)) {
    return Response.json({ error: "bad_target_card_id" }, { status: 400 });
  }
  let card;
  try {
    card = await applyAdminAction(board, cardId, action as AdminAction, {
      targetCardId: typeof targetCardId === "string" ? targetCardId : undefined,
    });
  } catch (e) {
    if (e instanceof AdminActionError) return Response.json({ error: e.code }, { status: 409 });
    throw e;
  }
  if (!card) return Response.json({ error: "card_not_found" }, { status: 404 });
  console.log(`admin ${slug}: ${action} ${cardId}${card.duplicate_of ? ` duplicate of ${card.duplicate_of}` : ""}`);
  return Response.json({ card }, { headers: { "Cache-Control": "no-store" } });
}
