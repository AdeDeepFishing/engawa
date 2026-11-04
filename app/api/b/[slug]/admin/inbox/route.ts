import { type NextRequest } from "next/server";
import { ADMIN_API_COOKIE, isAdminCookie } from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { getInboxAdminState, newInboxSecret, setInboxSecretHash, setInboxSenders } from "@/lib/db/inbox";
import { normalizeSenders } from "@/lib/inbox/clean";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin settings of the board's official inbox (docs/INBOX.md). Same gate as
 * the other admin writes: the admin API cookie, whose path covers this route.
 * Body: JSON
 *   {action: "new_secret"}                 a new bearer secret, answered once as {secret, state};
 *                                          only its digest is stored, the old one stops working
 *   {action: "save_senders", senders: []}  the allowed sender addresses, at most ten;
 *                                          400 invalid_senders with the refused entries
 * Every answer carries the state the admin page shows: has_secret, senders,
 * and the times of the last five accepted mails.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return Response.json({ error: "no_database" }, { status: 503 });
  if (!isAdminCookie(req.cookies.get(ADMIN_API_COOKIE)?.value)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { action?: unknown; senders?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });
  const before = await getInboxAdminState(board.id);
  if (!before.available) return Response.json({ error: "inbox_unavailable" }, { status: 503 });
  const noStore = { headers: { "Cache-Control": "no-store" } };

  if (body.action === "new_secret") {
    const { secret, hash } = newInboxSecret();
    await setInboxSecretHash(board.id, hash);
    console.log(`admin ${slug}: new inbox secret`);
    return Response.json({ secret, state: await getInboxAdminState(board.id) }, noStore);
  }
  if (body.action === "save_senders") {
    if (!Array.isArray(body.senders) || body.senders.length > 50 || !body.senders.every((s) => typeof s === "string")) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    const { senders, invalid } = normalizeSenders(body.senders as string[]);
    if (invalid.length > 0) return Response.json({ error: "invalid_senders", invalid }, { status: 400 });
    await setInboxSenders(board.id, senders);
    console.log(`admin ${slug}: inbox senders saved (${senders.length})`);
    return Response.json({ state: await getInboxAdminState(board.id) }, noStore);
  }
  return Response.json({ error: "bad_action" }, { status: 400 });
}
