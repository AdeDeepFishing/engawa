import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBoardBySlug, listHiddenDuplicates, listPublicCards } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { INTL_LOCALE, LANGS, t, withLangParam } from "@/lib/i18n";
import { getLinkLang, getRequestLang } from "@/lib/i18n/server";
import { BoardView } from "@/components/board/BoardView";
import { parseBoardView } from "@/lib/cards/places";
import { appBase } from "@/lib/app-url";
import { AboutLink } from "@/components/about/AboutLink";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ogLocale = (tag: string) => tag.replace("-", "_");

/**
 * Title and description in the reader's language: the shared link's `?lang=`,
 * else the cookie, else Accept-Language. Link crawlers send neither cookie nor
 * header, which is why shared links carry `?lang=`; a bare link previews in
 * Japanese. og:url keeps the parameter. The OG image comes from
 * opengraph-image.tsx next to this file.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [board, lang, linkLang, base] = await Promise.all([getBoardBySlug(slug), getRequestLang(), getLinkLang(), appBase()]);
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
      url: linkLang ? withLangParam(`/b/${board.slug}`, linkLang) : `/b/${board.slug}`,
      locale: ogLocale(INTL_LOCALE[lang]),
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => ogLocale(INTL_LOCALE[l])),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BoardPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
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
      footer={<AboutLink boardSlug={board.slug} />}
      initialView={parseBoardView(query.view) ?? "list"}
    />
  );
}
