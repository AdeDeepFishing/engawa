import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardPage } from "@/components/board/CardPage";
import { appBase } from "@/lib/app-url";
import { cardPath } from "@/lib/cards/share";
import { getPublicCardTrace } from "@/lib/db/cards";
import { hasDb } from "@/lib/db/client";
import { loadPublicCard } from "@/lib/db/public-card";
import { INTL_LOCALE, LANGS } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";

type Props = { params: Promise<{ slug: string; id: string }> };

/** Link previews cut descriptions around here; the body is cut at a word before it. */
const DESCRIPTION_CHARS = 200;

const ogLocale = (tag: string) => tag.replace("-", "_");

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
  const [found, lang, base] = await Promise.all([loadPublicCard(slug, id), getRequestLang(), appBase()]);
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
  const found = await loadPublicCard(slug, id);
  if (!found) notFound();
  const trace = hasDb() ? await getPublicCardTrace(found.card.id) : null;
  return <CardPage board={found.board} card={found.card} trace={trace} serverNow={new Date().toISOString()} />;
}
