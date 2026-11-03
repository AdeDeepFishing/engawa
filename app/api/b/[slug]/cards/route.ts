import { NextResponse, type NextRequest } from "next/server";
import { getBoardBySlug, listHiddenDuplicates, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { failStuckSubmissions } from "@/lib/db/submissions";

export const dynamic = "force-dynamic";

/** Public cards for the board, plus the duplicates hidden behind them. Polled by the client every 5 seconds. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (hasDb()) await failStuckSubmissions(board.id);
  const [cards, hiddenDuplicates] = await Promise.all([listPublicCards(board), listHiddenDuplicates(board.id)]);
  return NextResponse.json(
    { cards, hidden_duplicates: hiddenDuplicates, now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
