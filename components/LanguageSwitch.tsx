"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

export function LanguageSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="cursor-pointer rounded-lg border border-line bg-surface px-3 text-base hover:border-accent"
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {t(`lang.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
