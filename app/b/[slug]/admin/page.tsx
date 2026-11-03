import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_PAGE_COOKIE, isAdminCookie, listCardsForAdmin } from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import { t } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import { AdminView, InvalidAdminLink } from "./AdminView";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  return {
    title: `${t("admin.title", lang)} | Engawa`,
    robots: { index: false, follow: false },
  };
}

/**
 * Admin for one board: the held queue (publish or hide), confirm official,
 * hide any card. The admin arrives here through the entry link
 * (/api/b/[slug]/admin/enter), which checks the token and sets an HttpOnly
 * cookie; this page reads only that cookie, so the URL carries no secret.
 * Without a valid cookie nothing about the cards is rendered.
 */
export default async function AdminPage({ params }: Props) {
  const [{ slug }, store] = await Promise.all([params, cookies()]);
  const board = await getBoardBySlug(slug);
  if (!board) notFound();
  if (!hasDb() || !isAdminCookie(store.get(ADMIN_PAGE_COOKIE)?.value)) return <InvalidAdminLink />;
  const lists = await listCardsForAdmin(board);
  return <AdminView board={board} lists={lists} serverNow={new Date().toISOString()} />;
}
