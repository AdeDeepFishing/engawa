"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The selected card lives in the URL hash as `#card-<id>`, the same id the
 * card's list item carries, so a refresh or a copied link opens the same card
 * (and the browser scrolls the list to it on load). Read as an external
 * store: null on the server and in the hydration render, the hash right after.
 * Written with replaceState, so opening cards adds no history entries and the
 * back button still leaves the board, as before.
 */
const PREFIX = "#card-";
const CHANGE = "engawa:cardhash";

function read(): string | null {
  const hash = window.location.hash;
  return hash.startsWith(PREFIX) && hash.length > PREFIX.length ? decodeURIComponent(hash.slice(PREFIX.length)) : null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useCardHash(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((next: string | null) => {
    if (next === read()) return;
    const { pathname, search } = window.location;
    const url = next ? `${pathname}${search}${PREFIX}${encodeURIComponent(next)}` : `${pathname}${search}`;
    // Next's router keeps its own entry in history.state; carry it over.
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return [id, set];
}
