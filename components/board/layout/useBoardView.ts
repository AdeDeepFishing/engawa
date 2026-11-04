"use client";

import { useCallback, useEffect, useState } from "react";
import { parseBoardView, type BoardViewMode } from "@/lib/cards/places";

const PARAM = "view";
const LS_VIEW = "engawa.view";

/** `?view=places` in the address bar, so a copied link opens the same view; the list is the plain URL. */
function writeUrl(view: BoardViewMode) {
  const url = new URL(window.location.href);
  if (view === "places") url.searchParams.set(PARAM, view);
  else url.searchParams.delete(PARAM);
  if (url.href === window.location.href) return;
  // Next's router keeps its own entry in history.state; carry it over, as the card hash does.
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function readStored(): BoardViewMode | null {
  try {
    return parseBoardView(window.localStorage.getItem(LS_VIEW));
  } catch {
    return null;
  }
}

function writeStored(view: BoardViewMode) {
  try {
    window.localStorage.setItem(LS_VIEW, view);
  } catch {
    // Private mode or blocked storage: the URL still carries the choice.
  }
}

/**
 * The board's view. The server renders `initial` (from `?view=` on the
 * request). Right after hydration the URL wins, so a shared link opens the
 * view it names, even from an offline copy rendered for another URL; a URL
 * without one takes the reader's last choice from localStorage, as the
 * language does, and the address bar is updated to match. Choosing a view
 * writes both.
 */
export function useBoardView(initial: BoardViewMode): [BoardViewMode, (view: BoardViewMode) => void] {
  const [view, setViewState] = useState<BoardViewMode>(initial);

  useEffect(() => {
    // Deferred so the first client render matches the server HTML, and after
    // the offline check, which asks about the page by the URL it loaded.
    const id = window.setTimeout(() => {
      const fromUrl = parseBoardView(new URLSearchParams(window.location.search).get(PARAM));
      const next = fromUrl ?? readStored();
      if (!next) return;
      setViewState(next);
      if (!fromUrl) writeUrl(next);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const setView = useCallback((next: BoardViewMode) => {
    setViewState(next);
    writeUrl(next);
    writeStored(next);
  }, []);

  return [view, setView];
}
