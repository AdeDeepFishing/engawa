import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBoardBySlug, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { getRequestLang } from "@/lib/i18n/server";
import { BoardView } from "@/components/board/BoardView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [board, lang] = await Promise.all([getBoardBySlug(slug), getRequestLang()]);
  if (!board) return { title: "Engawa" };
  return { title: `${board.name[lang]} | Engawa` };
}

export default async function BoardPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) notFound();
  const cards = await listPublicCards(board);
  return (
    <BoardView
      board={board}
      initialCards={cards}
      serverNow={new Date().toISOString()}
      canSubmit={hasDb()}
    />
  );
}
