"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { THEMES, type Theme } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/** Space kept between the open menu and the edges of the viewport, px. */
const EDGE = 8;

/** Half a disc for auto (the system decides), a sun for light, a moon for dark. */
function ThemeIcon({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      {theme === "auto" ? (
        <>
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M10 3.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" />
        </>
      ) : theme === "light" ? (
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
 * The appearance menu in the top bar, beside the text size toggle and drawn
 * like it: a 44 px button showing the current choice's icon that opens a
 * menu of auto (follow the system), light and dark, the current one checked.
 * It works like the language menu (components/LanguageSwitch.tsx): opening
 * moves focus to the current choice; arrow keys, Home and End move, Enter or
 * Space picks, Escape closes, and both return focus to the button. A click
 * outside or Tab away closes it. The choice goes through `setTheme`, which
 * sets data-theme on <html> at once and writes the engawa_theme cookie, so
 * the next server render matches.
 */
export function ThemeToggle() {
  const { theme, setTheme, t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonId = useId();
  const menuId = useId();

  function focusItem(i: number) {
    const n = THEMES.length;
    itemRefs.current[((i % n) + n) % n]?.focus();
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(next: Theme) {
    setTheme(next);
    close(true);
  }

  // Once open: keep the menu inside the viewport, then focus the current choice.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.translate = "";
    const r = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const dx = r.left < EDGE ? EDGE - r.left : r.right > vw - EDGE ? vw - EDGE - r.right : 0;
    if (dx) menu.style.translate = `${dx}px 0`;
    menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  // A resize or a rotation while the menu is open: the placement no longer holds, so it closes.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  // A press anywhere outside closes the menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = itemRefs.current.indexOf(document.activeElement as HTMLDivElement);
    switch (e.key) {
      case "ArrowDown":
        focusItem(i + 1);
        break;
      case "ArrowUp":
        focusItem(i - 1);
        break;
      case "Home":
        focusItem(0);
        break;
      case "End":
        focusItem(THEMES.length - 1);
        break;
      case "Enter":
      case " ":
        if (i >= 0) choose(THEMES[i]);
        break;
      case "Escape":
        close(true);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // Focus moved elsewhere on the page closes the menu. Focus going nowhere
  // (another window, or Safari, which does not focus a clicked button) does not.
  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (open && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className="inline-flex items-center justify-center rounded-lg border border-line-strong bg-surface px-2.5 hover:border-accent active:bg-held-bg aria-expanded:border-accent"
      >
        <span className="sr-only">
          {t("nav.theme")}: {t(`theme.${theme}`)}
        </span>
        <ThemeIcon theme={theme} className="size-5 shrink-0" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKey}
          className="lang-menu-in absolute top-full right-0 z-30 mt-2 w-max min-w-full rounded-lg border border-line-strong bg-surface py-1 shadow-[var(--shadow-lift)]"
        >
          {THEMES.map((th, i) => {
            const current = th === theme;
            return (
              <div
                key={th}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitemradio"
                aria-checked={current}
                tabIndex={-1}
                onClick={() => choose(th)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 pr-5 pl-3 text-base hover:bg-held-bg focus:bg-accent-soft ${
                  current ? "font-semibold text-accent" : ""
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-4 shrink-0 ${current ? "" : "invisible"}`}>
                  <path d="M3 8.5l3.25 3.25L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <ThemeIcon theme={th} className="size-5 shrink-0" />
                {t(`theme.${th}`)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
