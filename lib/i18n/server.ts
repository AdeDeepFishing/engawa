import { cookies, headers } from "next/headers";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  TEXT_SIZE_COOKIE,
  isLang,
  langFromAcceptLanguage,
  type Lang,
  type TextSize,
} from "./index";

/**
 * Language for the first server render: the cookie the client wrote on a
 * previous visit, otherwise the browser's Accept-Language, otherwise Japanese.
 * The client provider takes over after hydration and keeps the cookie and
 * localStorage in sync.
 */
export async function getRequestLang(): Promise<Lang> {
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
