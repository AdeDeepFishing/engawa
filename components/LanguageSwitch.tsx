"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

export function LanguageSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="cursor-pointer appearance-none rounded-lg border border-line bg-surface py-0 pr-10 pl-3 text-base text-foreground hover:border-accent"
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {t(`lang.${l}`)}
          </option>
        ))}
      </select>
      {/* The browser's own arrow is removed (appearance-none) because it sat at the far edge; this one sits 12 px in, inside the right padding. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 size-4 text-foreground"
      >
        <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
