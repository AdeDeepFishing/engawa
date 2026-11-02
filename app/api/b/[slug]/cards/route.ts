import { NextResponse, type NextRequest } from "next/server";
import { getBoardBySlug, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { failStuckSubmissions } from "@/lib/db/submissions";

export const dynamic = "force-dynamic";

/** Public cards for the board. Polled by the client every 5 seconds. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (hasDb()) await failStuckSubmissions(board.id);
  const cards = await listPublicCards(board);
  return NextResponse.json(
    { cards, now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
