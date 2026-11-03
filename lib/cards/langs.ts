import { CARD_LANGS, type CardLang } from "@/lib/i18n";
import type { Card, ConflictStatement, Multilingual, PartialMultilingual } from "@/lib/types";

/**
 * Card text arrives in two steps since 2026-11-04: extract writes Japanese,
 * English and the input's own language, and a translate call fills the other
 * languages a few seconds later (docs/DEVLOG.md). Until that lands, and after
 * a translate that failed, a card can lack languages. These helpers say which
 * ones, and give readers text to show instead of a blank: English, then
 * Japanese; for やさしい日本語 Japanese first, since it is Japanese. The
 * stored row is never changed by any of them.
 */

/** Which languages stand in for a missing one, in order of preference. */
export const LANG_FALLBACK: Record<CardLang, readonly CardLang[]> = {
  ja: ["en"],
  en: ["ja"],
  zh: ["en", "ja"],
  ko: ["en", "ja"],
  vi: ["en", "ja"],
  easy_ja: ["ja", "en"],
};

type Texts = Partial<Record<CardLang, string>> | null | undefined;

export function hasText(m: Texts, lang: CardLang): boolean {
  const v = m?.[lang];
  return typeof v === "string" && v.trim().length > 0;
}

/** Languages in which the title or the body is missing or empty. Empty when the text is complete. */
export function missingLangs(title: Texts, body: Texts): CardLang[] {
  return CARD_LANGS.filter((l) => !hasText(title, l) || !hasText(body, l));
}

/** The language a reader of `lang` actually gets from `m`: `lang` itself, else the first fallback that exists. */
export function textLang(m: Texts, lang: CardLang): CardLang {
  if (hasText(m, lang)) return lang;
  return LANG_FALLBACK[lang].find((l) => hasText(m, l)) ?? lang;
}

/** Every language present: a missing one carries a copy of its fallback. */
export function fillLangs(m: PartialMultilingual): Multilingual {
  const out = {} as Multilingual;
  for (const l of CARD_LANGS) out[l] = m[textLang(m, l)] ?? m.en ?? m.ja ?? "";
  return out;
}

function fillStatement(s: ConflictStatement): ConflictStatement {
  if (!s.title && !s.body) return s;
  return {
    ...s,
    title: s.title ? fillLangs(s.title) : s.title,
    body: s.body ? fillLangs(s.body) : s.body,
  };
}

/**
 * A card as readers get it: title, body and every statement filled in all
 * six languages, and `missing_langs` naming the ones that are stand-ins so
 * the UI can mark the text with its real language and say that the
 * translation is on its way.
 */
export function withLangFallback<T extends Pick<Card, "title" | "body" | "conflict">>(
  card: T,
): T & { missing_langs: CardLang[] } {
  const missing = missingLangs(card.title, card.body);
  const statements = card.conflict?.statements;
  const needsStatements = statements?.some((s) => missingLangs(s.title ?? null, s.body ?? null).length > 0);
  if (missing.length === 0 && !needsStatements) return { ...card, missing_langs: [] };
  return {
    ...card,
    title: fillLangs(card.title),
    body: fillLangs(card.body),
    conflict: statements && needsStatements ? { ...card.conflict, statements: statements.map(fillStatement) } : card.conflict,
    missing_langs: missing,
  };
}

/**
 * The language of the text a reader of `lang` sees on a card that went
 * through withLangFallback: `lang` unless the card still lacks it.
 */
export function shownLang(card: Pick<Card, "missing_langs">, lang: CardLang): CardLang {
  const missing = card.missing_langs ?? [];
  if (!missing.includes(lang)) return lang;
  return LANG_FALLBACK[lang].find((l) => !missing.includes(l)) ?? lang;
}

/** The BCP 47 tag for a card language, for the `lang` attribute. */
export function htmlLang(lang: CardLang): string {
  return lang === "easy_ja" ? "ja" : lang;
}

/**
 * The `lang` attribute for a card text shown to a reader of `lang`: the
 * fallback language's tag while the card still lacks `lang`, else undefined
 * (the element inherits the page language). Truthy also means "show the
 * translation hint".
 */
export function fallbackLangAttr(card: Pick<Card, "missing_langs">, lang: CardLang): string | undefined {
  const shown = shownLang(card, lang);
  return shown === lang ? undefined : htmlLang(shown);
}
