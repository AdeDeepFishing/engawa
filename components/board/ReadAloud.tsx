"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CardLang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Card } from "@/lib/types";

/** Voice language per card language. Easy Japanese is read by the Japanese voice. */
export const VOICE_LANG: Record<CardLang, string> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
  ko: "ko-KR",
  vi: "vi-VN",
  easy_ja: "ja-JP",
};

// Whether the browser can speak, read as an external store: false in the
// server snapshot and in the first client render, so the sheet and the card
// page hydrate without a mismatch, then the real answer right after. The API
// does not appear or vanish while the page is open. (An effect that sets
// state is what the repository's lint rule forbids; same pattern as CardShare.)
const subscribeNever = () => () => {};
const hasSpeech = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
const noSpeechOnServer = () => false;

/** The installed voice for a tag: an exact match, else the first voice of that language, else none (the engine then picks). */
function pickVoice(tag: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const want = tag.toLowerCase();
  const primary = want.split("-")[0];
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v) === want && v.default) ??
    voices.find((v) => norm(v) === want) ??
    voices.find((v) => norm(v).startsWith(`${primary}-`) || norm(v) === primary) ??
    null
  );
}

/** Title and body split into sentences: Chrome stops long utterances after about 15 seconds, short ones are safe. */
function sentences(card: Card, l: CardLang): string[] {
  const text = `${card.title[l]}\n${card.body[l]}`;
  return text
    .split(/(?<=[。．.!?！？\n])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * "Read aloud": the card title and body through the Web Speech API in the
 * reader's language, and the easy Japanese version, each a 44 px button that
 * becomes "Stop" while it speaks. Rendered only when the browser can speak,
 * decided after hydration. Vietnamese may have no installed voice on some
 * phones; the engine then falls back to a default voice or stays silent.
 */
export function ReadAloud({ card }: { card: Card }) {
  const { lang, t } = useLang();
  const available = useSyncExternalStore(subscribeNever, hasSpeech, noSpeechOnServer);
  const [speaking, setSpeaking] = useState<CardLang | null>(null);
  // Utterances are kept referenced until they end: Safari drops the speech
  // when the object is collected mid-sentence.
  const queue = useRef<SpeechSynthesisUtterance[]>([]);

  // Leaving the sheet or the page, or switching cards, stops the voice.
  useEffect(() => {
    return () => {
      if (hasSpeech()) window.speechSynthesis.cancel();
    };
  }, [card.id]);

  function stop() {
    window.speechSynthesis.cancel();
    queue.current = [];
    setSpeaking(null);
  }

  function speak(l: CardLang) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const tag = VOICE_LANG[l];
    const voice = pickVoice(tag);
    const parts = sentences(card, l).map((text) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = tag;
      if (voice) u.voice = voice;
      return u;
    });
    const last = parts[parts.length - 1];
    const done = () => {
      // A cancelled run also fires end or error; only the run still shown clears the state.
      if (queue.current.includes(last)) {
        queue.current = [];
        setSpeaking(null);
      }
    };
    last.onend = done;
    last.onerror = done;
    queue.current = parts;
    setSpeaking(l);
    for (const u of parts) synth.speak(u);
  }

  if (!available) return null;
  const options: CardLang[] = lang === "ja" ? ["ja", "easy_ja"] : [lang, "easy_ja"];
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-read-aloud>
      {options.map((l) => {
        const on = speaking === l;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => (on ? stop() : speak(l))}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-base font-semibold hover:border-accent"
            data-read-lang={l}
          >
            <span aria-hidden="true">{on ? "⏹" : "🔊"}</span>
            {on ? t("read.stop") : l === "easy_ja" ? t("read.easy") : t("read.aloud")}
          </button>
        );
      })}
    </div>
  );
}
