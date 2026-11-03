import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBoardBySlug, listHiddenDuplicates, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { INTL_LOCALE, LANGS, t } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import { BoardView } from "@/components/board/BoardView";
import { appBase } from "@/lib/app-url";

type Props = { params: Promise<{ slug: string }> };

const ogLocale = (tag: string) => tag.replace("-", "_");

/**
 * Title and description in the reader's language (cookie, else
 * Accept-Language). Link previews from crawlers usually arrive without either
 * and get Japanese. The OG image comes from opengraph-image.tsx next to this file.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [board, lang, base] = await Promise.all([getBoardBySlug(slug), getRequestLang(), appBase()]);
  if (!board) return { title: "Engawa" };
  const title = `${board.name[lang]} | Engawa`;
  const description = t("share.description", lang, { board: board.name[lang] });
  return {
    metadataBase: base,
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Engawa",
      title,
      description,
      url: `/b/${board.slug}`,
      locale: ogLocale(INTL_LOCALE[lang]),
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => ogLocale(INTL_LOCALE[l])),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BoardPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) notFound();
  const [cards, hiddenDuplicates] = await Promise.all([listPublicCards(board), listHiddenDuplicates(board.id)]);
  return (
    <BoardView
      board={board}
      initialCards={cards}
      initialHiddenDuplicates={hiddenDuplicates}
      serverNow={new Date().toISOString()}
      canSubmit={hasDb()}
    />
  );
}
