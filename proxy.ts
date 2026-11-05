import { NextResponse, type NextRequest } from "next/server";
import { isLang, LANG_PARAM, LINK_LANG_HEADER } from "@/lib/i18n/langs";

/**
 * A shared link names the sharer's language (`?lang=zh`) for link crawlers
 * that send no cookie and no Accept-Language (WeChat, LINE). Layouts cannot
 * read the query, so a valid value goes on as a request header that
 * getRequestLang reads before the cookie and the header: the OG title and
 * description, og:locale, <html lang> and the first render all follow the
 * link. Runs on every page request, with or without the parameter, so a
 * header the client sent itself is always dropped and only a valid `?lang=`
 * can set it.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(LINK_LANG_HEADER);
  const lang = request.nextUrl.searchParams.get(LANG_PARAM);
  if (isLang(lang)) headers.set(LINK_LANG_HEADER, lang);
  return NextResponse.next({ request: { headers } });
}

/**
 * Every page: not the API routes (none reads the language header) and not
 * Next's own files or static files with an extension (icons, samples, the
 * service worker), which render no language.
 */
export const config = {
  matcher: ["/((?!api/|_next/|.*\\.[A-Za-z0-9]+$).*)"],
};
