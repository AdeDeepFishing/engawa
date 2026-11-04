import { NextResponse, type NextRequest } from "next/server";
import { isLang, LANG_PARAM, LINK_LANG_HEADER } from "@/lib/i18n/langs";

/**
 * A shared link names the sharer's language (`?lang=zh`) for link crawlers
 * that send no cookie and no Accept-Language (WeChat, LINE). Layouts cannot
 * read the query, so a valid value goes on as a request header that
 * getRequestLang reads before the cookie and the header: the OG title and
 * description, og:locale, <html lang> and the first render all follow the
 * link. Runs only on page requests that carry the parameter. A request
 * without it never reaches here, so a client could send the header itself;
 * all it can do is pick one of the five languages.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(LINK_LANG_HEADER);
  const lang = request.nextUrl.searchParams.get(LANG_PARAM);
  if (isLang(lang)) headers.set(LINK_LANG_HEADER, lang);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [{ source: "/((?!api/|_next/).*)", has: [{ type: "query", key: "lang" }] }],
};
