import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CardPage } from "@/components/board/CardPage";
import { appBase } from "@/lib/app-url";
import { cardPath } from "@/lib/cards/share";
import { getBoardBySlug, getPublicCard } from "@/lib/db/boards";
import { getPublicCardTrace } from "@/lib/db/cards";
import { hasDb } from "@/lib/db/client";
import { INTL_LOCALE, LANGS } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import type { Board, Card } from "@/lib/types";

type Props = { params: Promise<{ slug: string; id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Link previews cut descriptions around here; the body is cut at a word before it. */
const DESCRIPTION_CHARS = 200;

const ogLocale = (tag: string) => tag.replace("-", "_");

/**
 * The board and the public card, or null when either is missing, so the
 * page answers 404 for held, hidden and unknown cards. A malformed id never
 * reaches the database. Cached per request: metadata and page share one read.
 */
const load = cache(async (slug: string, id: string): Promise<{ board: Board; card: Card } | null> => {
  const board = await getBoardBySlug(slug);
  if (!board) return null;
  if (hasDb() && !UUID_RE.test(id)) return null;
  const card = await getPublicCard(board, id);
  return card ? { board, card } : null;
});

function shorten(text: string): string {
  if (text.length <= DESCRIPTION_CHARS) return text;
  const cut = text.slice(0, DESCRIPTION_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${space > DESCRIPTION_CHARS / 2 ? cut.slice(0, space) : cut}...`;
}

/**
 * Title and description in the reader's language (cookie, else
 * Accept-Language; crawlers usually get Japanese), the board's OG image, and
 * absolute URLs through appBase().
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const [found, lang, base] = await Promise.all([load(slug, id), getRequestLang(), appBase()]);
  if (!found) return { title: "Engawa" };
  const { board, card } = found;
  const title = `${card.title[lang]} | ${board.name[lang]} | Engawa`;
  const description = shorten(card.body[lang]);
  const image = { url: `/b/${board.slug}/opengraph-image`, width: 1200, height: 630, alt: board.name[lang] };
  return {
    metadataBase: base,
    title,
    description,
    openGraph: {
      type: "article",
      siteName: "Engawa",
      title,
      description,
      url: cardPath(board.slug, card.id),
      images: [image],
      locale: ogLocale(INTL_LOCALE[lang]),
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => ogLocale(INTL_LOCALE[l])),
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function CardRoute({ params }: Props) {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if (!found) notFound();
  const trace = hasDb() ? await getPublicCardTrace(found.card.id) : null;
  return <CardPage board={found.board} card={found.card} trace={trace} serverNow={new Date().toISOString()} />;
}
