/**
 * Format rules for the localized 町丁目 names in supabase/seed/boards.json,
 * shared by scripts/area-names.ts (before it writes) and
 * scripts/check-boards.ts (on every run). The spelling rules themselves are
 * in lib/claude/prompts/area-names.system.md; these are the parts code can
 * check.
 */
import { CHOME_JA } from "../lib/cards/display";
import type { BoardAreaName } from "../lib/types";

export const AREA_NAME_LANGS = ["en", "zh", "ko", "vi"] as const;

const PATTERN: Record<(typeof AREA_NAME_LANGS)[number], RegExp> = {
  // ASCII letters, digits, spaces and the hyphen: no other dash, no accent.
  en: /^[A-Za-z0-9 -]+$/,
  vi: /^[A-Za-z0-9 -]+$/,
  // Han characters and digits: no Latin letter, no kana, no space.
  zh: /^[一-鿿0-9]+$/u,
  // Hangul syllables, digits and spaces.
  ko: /^[가-힣 0-9]+$/u,
};
/** How each language writes "N丁目" at the end of a name. */
const CHOME_END: Record<(typeof AREA_NAME_LANGS)[number], (n: string) => string> = {
  en: (n) => ` ${n}-chome`,
  vi: (n) => ` ${n}-chome`,
  zh: (n) => `${n}丁目`,
  ko: (n) => ` ${n}초메`,
};

/** What is wrong with one area's localized names; empty when nothing is. */
export function areaNameProblems(area: BoardAreaName): string[] {
  const problems: string[] = [];
  // The seed writes ASCII digits (scripts/geo/build.ts); a full-width one would pass as "no 丁目" here and fold as one on the home card.
  if (/[０-９]/u.test(area.name_ja)) problems.push("name_ja has a full-width digit");
  const chome = CHOME_JA.exec(area.name_ja)?.[1] ?? null;
  for (const lang of AREA_NAME_LANGS) {
    const name = area[`name_${lang}`];
    if (typeof name !== "string" || !name.trim()) {
      problems.push(`name_${lang} missing`);
      continue;
    }
    if (name !== name.trim() || /\s{2}/.test(name)) problems.push(`name_${lang} has stray spaces`);
    if (!PATTERN[lang].test(name)) problems.push(`name_${lang} has a character outside its set`);
    const ends = /([0-9]+)(-chome|丁目|초메)$/u.exec(name);
    if (chome ? !name.endsWith(CHOME_END[lang](chome)) : ends) problems.push(`name_${lang} does not end in the same 丁目`);
  }
  if (area.name_vi !== undefined && area.name_vi !== area.name_en) problems.push("name_vi differs from name_en");
  return problems;
}
