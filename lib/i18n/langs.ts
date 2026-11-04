/**
 * The UI languages and the language a shared link carries, without the
 * message files, so proxy.ts can import it and stay small.
 */
export const LANGS = ["ja", "en", "zh", "ko", "vi"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/**
 * Shared and copied links name the sharer's language as `?lang=zh`, because
 * the link crawlers of WeChat and LINE send neither the language cookie nor
 * Accept-Language, and the preview then came out in another language.
 */
export const LANG_PARAM = "lang";

/** Request header proxy.ts sets from a valid `?lang=`; getRequestLang reads it first. */
export const LINK_LANG_HEADER = "x-engawa-link-lang";

/** `href` (absolute, or a path) with `?lang=<lang>` set, keeping its other parameters and hash. */
export function withLangParam(href: string, lang: Lang): string {
  const absolute = /^https?:\/\//.test(href);
  const url = new URL(href, "http://relative.invalid");
  url.searchParams.set(LANG_PARAM, lang);
  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

/** `search` (as in location.search) without the `lang` parameter: "" when nothing else is left. */
export function withoutLangParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(LANG_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
