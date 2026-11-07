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
  THEME_COOKIE,
  isTheme,
  t as translate,
  type Lang,
  type MessageKey,
  LANGS,
  type TextSize,
  type Theme,
} from "./index";
import { isLang, LANG_PARAM, withoutLangParam } from "./langs";

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LangContext = createContext<Ctx | null>(null);

const LS_LANG = "engawa.lang";
const LS_TEXT = "engawa.textSize";
const LS_THEME = "engawa.theme";

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
  initialTheme,
  children,
}: {
  initialLang: Lang;
  initialTextSize: TextSize;
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [textSize, setTextSizeState] = useState<TextSize>(initialTextSize);
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  // The HTML may come from the service worker's cache, rendered with an older
  // choice than the reader's current one; the localStorage mirrors are newer.
  // A shared link's `?lang=` (see langs.ts) beats both: it is taken as if the
  // reader had picked it, stored, and removed from the address bar, so a
  // reload or a later switch is not overruled by the link.
  useEffect(() => {
    // Deferred so the first client render matches the server HTML; the change
    // applies right after hydration.
    const id = window.setTimeout(() => {
      const { pathname, search, hash } = window.location;
      const raw = new URLSearchParams(search).get(LANG_PARAM);
      const fromLink = isLang(raw) ? raw : null;
      if (raw !== null) {
        // Next's router keeps its own entry in history.state; carry it over.
        window.history.replaceState(window.history.state, "", `${pathname}${withoutLangParam(search)}${hash}`);
      }
      if (fromLink) {
        setLangState(fromLink);
        writeLocal(LS_LANG, fromLink);
        writeCookie(LANG_COOKIE, fromLink);
      }
      try {
        const l = window.localStorage.getItem(LS_LANG);
        const s = window.localStorage.getItem(LS_TEXT);
        const th = window.localStorage.getItem(LS_THEME);
        if (!fromLink && l && (LANGS as readonly string[]).includes(l) && l !== initialLang) setLangState(l as Lang);
        if ((s === "normal" || s === "large") && s !== initialTextSize) setTextSizeState(s);
        if (isTheme(th) && th !== initialTheme) setThemeState(th);
      } catch {
        // Blocked storage: the cookie's choice stands.
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialLang, initialTextSize, initialTheme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  // "auto" carries no attribute, so app/globals.css follows prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

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

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeLocal(LS_THEME, next);
    writeCookie(THEME_COOKIE, next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      textSize,
      setTextSize,
      theme,
      setTheme,
      t: (key, vars) => translate(key, lang, vars),
    }),
    [lang, setLang, textSize, setTextSize, theme, setTheme],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
