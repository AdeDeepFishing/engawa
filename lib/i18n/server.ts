import { cookies, headers } from "next/headers";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  TEXT_SIZE_COOKIE,
  THEME_COOKIE,
  isTheme,
  isLang,
  langFromAcceptLanguage,
  type Lang,
  type TextSize,
  type Theme,
} from "./index";
import { LINK_LANG_HEADER } from "./langs";

/**
 * The language a shared link names (`?lang=zh`), as proxy.ts passes it on;
 * null when the request names none. Pages use it to keep the parameter on
 * og:url, so a crawler that follows og:url gets the same language.
 */
export async function getLinkLang(): Promise<Lang | null> {
  const value = (await headers()).get(LINK_LANG_HEADER);
  return isLang(value) ? value : null;
}

/**
 * Language for the first server render: the language a shared link names,
 * otherwise the cookie the client wrote on a previous visit, otherwise the
 * browser's Accept-Language, otherwise Japanese. Link crawlers send neither
 * cookie nor Accept-Language, hence the link first. The client provider
 * takes over after hydration and keeps the cookie and localStorage in sync.
 */
export async function getRequestLang(): Promise<Lang> {
  const fromLink = await getLinkLang();
  if (fromLink) return fromLink;
  const jar = await cookies();
  const fromCookie = jar.get(LANG_COOKIE)?.value;
  if (isLang(fromCookie)) return fromCookie;
  const h = await headers();
  return langFromAcceptLanguage(h.get("accept-language")) ?? DEFAULT_LANG;
}

export async function getRequestTextSize(): Promise<TextSize> {
  const jar = await cookies();
  return jar.get(TEXT_SIZE_COOKIE)?.value === "large" ? "large" : "normal";
}

/** The theme the reader picked; "auto" (no cookie) leaves it to prefers-color-scheme. */
export async function getRequestTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "auto";
}
