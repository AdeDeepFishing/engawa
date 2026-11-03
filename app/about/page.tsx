import type { Metadata } from "next";
import { TopBar } from "@/components/TopBar";
import { AboutView } from "@/components/about/AboutView";
import { getBoardBySlug } from "@/lib/db/boards";
import { t } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";

type Props = { searchParams: Promise<{ b?: string | string[] }> };

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  return { title: `${t("about.title", lang)} | Engawa`, description: t("about.lead", lang) };
}

/**
 * /about, optionally /about?b=<slug> from a board's footer so the page can
 * link back to that board. The text lives in the five message files; the
 * figures and their sources are in components/about/AboutView.tsx.
 */
export default async function AboutPage({ searchParams }: Props) {
  const [{ b }, lang] = await Promise.all([searchParams, getRequestLang()]);
  const slug = typeof b === "string" && SLUG_RE.test(b) ? b : null;
  const board = slug ? await getBoardBySlug(slug) : null;
  return (
    <>
      <TopBar title={t("about.title", lang)} />
      <AboutView backHref={board ? `/b/${board.slug}` : null} />
    </>
  );
}
