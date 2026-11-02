import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminToken, listCardsForAdmin } from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { t } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import { AdminView, InvalidAdminLink } from "./AdminView";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  return {
    title: `${t("admin.title", lang)} | Engawa`,
    robots: { index: false, follow: false },
    // The token is in this page's URL: never send it onwards in a Referer.
    referrer: "no-referrer",
  };
}

/**
 * Secret-link admin for one board: the held queue (publish or hide),
 * confirm official, hide any card. The token is checked on the server in
 * constant time; without it nothing about the cards is rendered.
 */
export default async function AdminPage({ params, searchParams }: Props) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const board = await getBoardBySlug(slug);
  if (!board) notFound();
  const value = typeof token === "string" ? token : "";
  if (!hasDb() || !isAdminToken(value)) return <InvalidAdminLink />;
  const lists = await listCardsForAdmin(board);
  return <AdminView board={board} lists={lists} token={value} serverNow={new Date().toISOString()} />;
}
