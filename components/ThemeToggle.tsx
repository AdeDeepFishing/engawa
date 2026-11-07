"use client";

import { useSyncExternalStore } from "react";
import { useLang } from "@/lib/i18n/LangProvider";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function systemDarkNow() {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The server cannot see the system setting, so it renders as if light. */
function systemDarkOnServer() {
  return false;
}

/** A moon (a press switches to dark) or a sun (a press switches to light). */
function ThemeIcon({ to }: { to: "light" | "dark" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0">
      {to === "light" ? (
        <>
          <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M10 1.75v2M10 16.25v2M1.75 10h2M16.25 10h2M4.17 4.17l1.41 1.41M14.42 14.42l1.41 1.41M4.17 15.83l1.41-1.41M14.42 5.58l1.41-1.41"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          d="M16.5 12.25A7 7 0 0 1 7.75 3.5a7 7 0 1 0 8.75 8.75z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * The theme button in the top bar, beside the text size toggle and drawn
 * like it: one 44 px button that shows the mode a press switches to, a moon
 * while the page is light and a sun while it is dark. With no stored choice
 * ("auto") the page follows the system; the first press stores the opposite
 * of what is on screen, and from then on the choice is explicit (there is
 * deliberately no way back to auto). `setTheme` sets data-theme on <html> at
 * once and writes the engawa_theme cookie, so the next server render matches.
 * The server renders the icon for the stored choice, or light when auto;
 * after hydration the system setting corrects it, so the icon may swap on
 * first paint, but the theme itself is never wrong (the CSS decides it).
 */
export function ThemeToggle() {
  const { theme, setTheme, t } = useLang();
  const systemDark = useSyncExternalStore(subscribeSystem, systemDarkNow, systemDarkOnServer);
  const dark = theme === "dark" || (theme === "auto" && systemDark);
  return (
    <button
      type="button"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex items-center justify-center rounded-lg border border-line-strong bg-surface px-2.5 hover:border-accent active:bg-held-bg"
    >
      <span className="sr-only">{t(dark ? "theme.to_light" : "theme.to_dark")}</span>
      <ThemeIcon to={dark ? "light" : "dark"} />
    </button>
  );
}
