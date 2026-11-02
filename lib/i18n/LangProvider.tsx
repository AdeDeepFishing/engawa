"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LANG_COOKIE,
  TEXT_SIZE_COOKIE,
  t as translate,
  type Lang,
  type MessageKey,
  type TextSize,
} from "./index";

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LangContext = createContext<Ctx | null>(null);

const LS_LANG = "engawa.lang";
const LS_TEXT = "engawa.textSize";

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the cookie still carries the choice.
  }
}

/**
 * The server picks the first language from the cookie, else from
 * Accept-Language (the server-side view of navigator.language). Every change
 * here is written to the cookie, so the next server render matches, and to
 * localStorage as a mirror.
 */
export function LangProvider({
  initialLang,
  initialTextSize,
  children,
}: {
  initialLang: Lang;
  initialTextSize: TextSize;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [textSize, setTextSizeState] = useState<TextSize>(initialTextSize);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeLocal(LS_LANG, next);
    writeCookie(LANG_COOKIE, next);
  }, []);

  const setTextSize = useCallback((next: TextSize) => {
    setTextSizeState(next);
    writeLocal(LS_TEXT, next);
    writeCookie(TEXT_SIZE_COOKIE, next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      textSize,
      setTextSize,
      t: (key, vars) => translate(key, lang, vars),
    }),
    [lang, setLang, textSize, setTextSize],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
