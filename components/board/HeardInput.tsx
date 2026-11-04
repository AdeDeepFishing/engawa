"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { LANGS, type Lang, type MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

// The Web Speech API's recognition half is not in TypeScript's DOM library;
// these are the few members used here, as Chrome and Safari implement them.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Whether the browser can transcribe, read as an external store: false in the
// server snapshot and the first client render, so the panel hydrates without
// a mismatch, then the real answer right after (same pattern as ReadAloud).
const subscribeNever = () => () => {};
const hasRecognition = () => recognitionCtor() !== null;
const noRecognitionOnServer = () => false;

/** Recognition language per UI language. Japanese first: the broadcast is in Japanese. */
const RECOGNITION_LANG: Record<Lang, string> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
  ko: "ko-KR",
  vi: "vi-VN",
};

/** Appends a final piece of transcript to what the box holds, with one space between. */
function appendTranscript(prev: string, piece: string): string {
  if (!piece) return prev;
  if (!prev.trim()) return piece;
  return /\s$/.test(prev) ? prev + piece : `${prev} ${piece}`;
}

/**
 * "I heard the loudspeaker": the reader holds the phone up while the
 * 防災行政無線 broadcast plays, or right after, and the browser's speech
 * recognition writes the transcript into the box below. Interim words show
 * muted under the box; each final piece is appended to the box, which stays
 * editable, so a misheard name can be corrected before sending. Without
 * recognition (Firefox, an older phone) the same box takes typed text. The
 * box is the parent's text state: sending goes down the text path.
 */
export function HeardInput({
  value,
  onChange,
}: {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
}) {
  const { t } = useLang();
  const available = useSyncExternalStore(subscribeNever, hasRecognition, noRecognitionOnServer);
  const [speechLang, setSpeechLang] = useState<Lang>("ja");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const recRef = useRef<Recognition | null>(null);
  /** True while the reader wants to keep listening: Chrome ends a session after a silence, and it is started again. */
  const wantRef = useRef(false);

  // Closing the panel (or sending) stops the microphone.
  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
      recRef.current = null;
    },
    [],
  );

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = RECOGNITION_LANG[speechLang];
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let pending = "";
      const finals: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finals.push(text.trim());
        else pending += text;
      }
      const piece = finals.filter(Boolean).join(" ");
      if (piece) onChange((prev) => appendTranscript(prev, piece));
      setInterim(pending.trim());
    };
    rec.onerror = (e) => {
      // Silence ends the session; onend starts the next one.
      if (e.error === "no-speech" || e.error === "aborted") return;
      wantRef.current = false;
      setProblem(e.error === "not-allowed" || e.error === "service-not-allowed" ? "heard.mic_denied" : "heard.error");
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to stopped
        }
      }
      recRef.current = null;
      wantRef.current = false;
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    wantRef.current = true;
    setProblem(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      wantRef.current = false;
      setProblem("heard.error");
    }
  }

  function stop() {
    // stop(), not abort(): the words still being recognised arrive as final first.
    wantRef.current = false;
    recRef.current?.stop();
  }

  return (
    <div className="flex flex-col gap-3" data-heard-input>
      <p className="text-base">{t("heard.intro")}</p>
      {available ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-base">
            <span className="font-semibold">{t("heard.lang_label")}</span>
            <select
              value={speechLang}
              onChange={(e) => setSpeechLang(e.target.value as Lang)}
              disabled={listening}
              className="mt-1 rounded-lg border border-line bg-surface px-3 text-base disabled:opacity-60"
              data-heard-lang
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`lang.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-pressed={listening}
            className={
              listening
                ? "min-h-12 flex-1 rounded-xl border-2 border-accent bg-surface px-4 text-lg font-bold text-accent"
                : "min-h-12 flex-1 rounded-xl bg-accent px-4 text-lg font-bold text-accent-ink"
            }
            data-heard-mic
          >
            <span aria-hidden="true" className="mr-2">
              {listening ? "⏹️" : "🎙️"}
            </span>
            {listening ? t("heard.stop") : t("heard.start")}
          </button>
        </div>
      ) : (
        <p className="text-base text-muted" data-heard-unsupported>
          {t("heard.unsupported")}
        </p>
      )}
      {listening ? (
        <p role="status" aria-live="polite" className="text-base font-semibold">
          {t("heard.listening")}
        </p>
      ) : null}
      <label htmlFor="heard-text" className="text-base font-semibold">
        {t("heard.box_label")}
      </label>
      <textarea
        id="heard-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("heard.placeholder")}
        lang={RECOGNITION_LANG[speechLang]}
        rows={6}
        className="w-full rounded-xl border border-line bg-surface p-3 text-base"
        data-heard-text
      />
      {interim ? (
        <p className="text-base text-muted" lang={RECOGNITION_LANG[speechLang]} data-heard-interim>
          {interim}
        </p>
      ) : null}
      <p className="rounded-lg bg-warn-bg px-3 py-2 text-base text-warn-ink">{t("heard.may_be_wrong")}</p>
      {available ? <p className="text-base text-muted">{t("heard.privacy")}</p> : null}
      {problem ? (
        <p role="alert" className="text-base text-warn-ink">
          {t(problem)}
        </p>
      ) : null}
    </div>
  );
}
