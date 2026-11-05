import ja from "./messages/ja.json";
import en from "./messages/en.json";
import zh from "./messages/zh.json";
import ko from "./messages/ko.json";
import vi from "./messages/vi.json";
import { LANGS, isLang, type Lang } from "./langs";

export { LANGS, isLang, LANG_PARAM, withLangParam, type Lang } from "./langs";

/** Languages card content is written in. UI strings exist only for LANGS. */
export const CARD_LANGS = [...LANGS, "easy_ja"] as const;
export type CardLang = (typeof CARD_LANGS)[number];

export type MessageKey = keyof typeof en;

const messages: Record<Lang, Record<string, string>> = { ja, en, zh, ko, vi };

export const DEFAULT_LANG: Lang = "ja";

export function isCardLang(value: unknown): value is CardLang {
  return typeof value === "string" && (CARD_LANGS as readonly string[]).includes(value);
}

/**
 * Look up a UI string. Falls back to Japanese, then to the key itself, so a
 * missing entry is visible instead of blank. `{name}` placeholders are
 * replaced from `vars`.
 */
export function t(
  key: MessageKey,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  const raw = messages[lang]?.[key] ?? messages.ja[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/**
 * A UI string split around one placeholder, for a value rendered as markup
 * rather than text (a name with its Japanese marked lang="ja"):
 * "Self-reported area: {area}" gives ["Self-reported area: ", ""].
 */
export function tAround(key: MessageKey, lang: Lang, name: string): [string, string] {
  const raw = messages[lang]?.[key] ?? messages.ja[key] ?? key;
  const at = raw.indexOf(`{${name}}`);
  return at < 0 ? [raw, ""] : [raw.slice(0, at), raw.slice(at + name.length + 2)];
}

/** Count-aware helper for keys that have `_one` and `_other` variants. */
export function tCount(base: string, lang: Lang, n: number): string {
  const key = (n === 1 ? `${base}_one` : `${base}_other`) as MessageKey;
  return t(key, lang, { n });
}

/** Map a BCP 47 tag such as `zh-Hant-TW` or `ja-JP` to a supported UI language. */
export function langFromTag(tag: string | null | undefined): Lang | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLang(primary) ? primary : null;
}

/** Pick the first supported language from an Accept-Language header. */
export function langFromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const lang = langFromTag(tag);
    if (lang) return lang;
  }
  return null;
}

/** Locale tag for Intl formatting per UI language. */
export const INTL_LOCALE: Record<Lang, string> = {
  ja: "ja-JP",
  en: "en-GB",
  zh: "zh-CN",
  ko: "ko-KR",
  vi: "vi-VN",
};

export const LANG_COOKIE = "engawa_lang";
export const TEXT_SIZE_COOKIE = "engawa_text";
export type TextSize = "normal" | "large";
