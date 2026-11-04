import type { Metadata } from "next";
import { listBoardsWithStats } from "@/lib/db/boards";
import { getRequestLang } from "@/lib/i18n/server";
import { INTL_LOCALE, t } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { BRAND_JA } from "@/components/brand/Mark";
import { HomeView } from "@/components/home/HomeView";
import type { HomeBoard } from "@/components/home/BoardSummary";

/**
 * Title and description in the reader's language (cookie, else
 * Accept-Language). The preview image is app/opengraph-image.tsx.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  const title = `${BRAND_JA} Engawa`;
  const description = t("home.lead", lang);
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Engawa",
      title,
      description,
      url: "/",
      locale: INTL_LOCALE[lang].replace("-", "_"),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The home page: one query for every listed board with its live facts, rendered by HomeView. */
export default async function Home() {
  const boards: HomeBoard[] = (await listBoardsWithStats()).map((b) => ({
    slug: b.slug,
    name: b.name,
    area_names: b.area_names,
    public_cards: b.public_cards,
    newest_card_at: b.newest_card_at,
  }));
  return (
    <>
      <TopBar home />
      <HomeView boards={boards} now={new Date().toISOString()} />
    </>
  );
}
