"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/** Space kept between the open menu and the edges of the viewport, px. */
const EDGE = 8;

/**
 * The language menu in the top bar: a button with the current language and
 * a chevron, drawn like the text size toggle beside it, that opens a menu
 * of the five languages under it, each in its own language (and `lang`),
 * the current one checked. Opening moves focus to the current language;
 * arrow keys, Home and End move, Enter or Space picks, Escape closes, and
 * both return focus to the button. A click outside or Tab away closes it.
 * The menu is moved back inside the viewport when it would cross an edge,
 * and scrolls when the viewport is too short for it. The choice goes
 * through `setLang`, which writes the cookie.
 */
export function LanguageSwitch() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonId = useId();
  const menuId = useId();

  function focusItem(i: number) {
    const n = LANGS.length;
    itemRefs.current[((i % n) + n) % n]?.focus();
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(next: Lang) {
    setLang(next);
    close(true);
  }

  // Once open: keep the menu inside the viewport, then focus the current language.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.translate = "";
    menu.style.maxHeight = "";
    const r = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const dx = r.left < EDGE ? EDGE - r.left : r.right > vw - EDGE ? vw - EDGE - r.right : 0;
    if (dx) menu.style.translate = `${dx}px 0`;
    if (r.bottom > window.innerHeight - EDGE) menu.style.maxHeight = `${Math.max(window.innerHeight - EDGE - r.top, 88)}px`;
    menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
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
        focusItem(LANGS.length - 1);
        break;
      case "Enter":
      case " ":
        if (i >= 0) choose(LANGS[i]);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        // Tab leaves the menu where focus goes next; it only closes.
        setOpen(false);
        return;
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
        className="group inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-base font-semibold hover:border-accent active:bg-held-bg aria-expanded:border-accent"
      >
        <span className="sr-only">{t("nav.language")}: </span>
        <span lang={lang}>{t(`lang.${lang}`)}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4 shrink-0 transition-transform duration-150 ease-out group-aria-expanded:rotate-180"
        >
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKey}
          className="lang-menu-in absolute top-full right-0 z-30 mt-2 w-max min-w-full overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-[var(--shadow-lift)]"
        >
          {LANGS.map((l, i) => {
            const current = l === lang;
            return (
              <div
                key={l}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitemradio"
                aria-checked={current}
                tabIndex={-1}
                lang={l}
                onClick={() => choose(l)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 pr-5 pl-3 text-base hover:bg-held-bg focus:bg-accent-soft ${
                  current ? "font-semibold text-accent" : ""
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-4 shrink-0 ${current ? "" : "invisible"}`}>
                  <path d="M3 8.5l3.25 3.25L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t(`lang.${l}`)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
