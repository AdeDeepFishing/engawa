"use client";

import { useEffect, useState } from "react";
import { CARD_LANGS, t as translate, type CardLang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/** How long each language stays before the next fades in. */
const STEP_MS = 4000;

/** The tagline in one card language: the five UI languages from app.tagline, やさしい日本語 from its own key. */
function taglineIn(l: CardLang): string {
  return l === "easy_ja" ? translate("home.tagline_easy_ja", "ja") : translate("app.tagline", l);
}

/**
 * The tagline under the home page description, shown once in each of the
 * six card languages: it starts in the reader's language, fades through the
 * other five, 4 seconds each, and comes back to the reader's language and
 * stays (nothing on the page loops). All six sit in one grid cell, so the
 * line is as tall as the tallest and the layout never moves; each carries
 * its own lang. Screen readers get the reader's language only. Under
 * reduced motion it does not cycle.
 */
export function Tagline({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  // The step of the pass for the language it started in; a language switch starts a new pass.
  const [step, setStep] = useState<{ from: CardLang; at: CardLang } | null>(null);
  const shown = step && step.from === lang ? step.at : lang;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = CARD_LANGS.indexOf(lang);
    const order = CARD_LANGS.map((_, i) => CARD_LANGS[(start + i + 1) % CARD_LANGS.length]);
    let i = 0;
    const timer = window.setInterval(() => {
      setStep({ from: lang, at: order[i] });
      i += 1;
      if (i === order.length) window.clearInterval(timer);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [lang]);

  return (
    <p className={`grid ${className}`}>
      {CARD_LANGS.map((l) => (
        <span
          key={l}
          lang={l === "easy_ja" ? "ja" : l}
          aria-hidden={l === lang ? undefined : true}
          // The outgoing line fades out first and the next fades in after it, so two scripts never overlap.
          className={`col-start-1 row-start-1 transition-opacity duration-300 ease-in-out ${l === shown ? "opacity-100 delay-300" : "opacity-0"}`}
        >
          {taglineIn(l)}
        </span>
      ))}
    </p>
  );
}
