import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_SECONDS, adminCookies, adminCookieValue, isAdminToken } from "@/lib/db/admin";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The admin link. `GET /api/b/[slug]/admin/enter?token=` checks the token in
 * constant time, sets the admin cookies and redirects to the clean admin
 * page, so after this one request the token is in no page URL, Referer or
 * history entry. A wrong token redirects just the same without a cookie, and
 * the page then shows "this link is not valid". Nothing here logs the URL;
 * next.config.ts keeps this path out of the dev request log as well.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return Response.json({ error: "board_not_found" }, { status: 404 });

  const res = NextResponse.redirect(new URL(`/b/${slug}/admin`, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  const value = hasDb() && isAdminToken(req.nextUrl.searchParams.get("token")) ? adminCookieValue() : null;
  if (value) {
    for (const { name, path } of adminCookies(slug)) {
      res.cookies.set({
        name,
        value,
        path,
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "lax",
        maxAge: ADMIN_SESSION_SECONDS,
      });
    }
  }
  return res;
}
