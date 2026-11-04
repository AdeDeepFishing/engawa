import { NextResponse, type NextRequest } from "next/server";
import { getBoardBySlug, listHiddenDuplicates, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { modeForReaders } from "@/lib/db/mode";
import { failStuckSubmissions } from "@/lib/db/submissions";

export const dynamic = "force-dynamic";

/**
 * Public cards for the board, plus the duplicates hidden behind them, and the
 * board's mode (N21: peace or disaster, and for disaster when and why), so a
 * reader with the board open follows a switch. Polled by the client every 5
 * seconds. The auto return to peace is checked on the page load, not here.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (hasDb()) await failStuckSubmissions(board.id);
  const [cards, hiddenDuplicates, mode] = await Promise.all([
    listPublicCards(board),
    listHiddenDuplicates(board.id),
    modeForReaders(board),
  ]);
  return NextResponse.json(
    { cards, hidden_duplicates: hiddenDuplicates, mode, now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
