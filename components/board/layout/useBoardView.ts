"use client";

import { useCallback, useEffect, useState } from "react";
import { parseBoardView, VIEW_COOKIE, type BoardViewMode } from "@/lib/cards/places";

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

/** The cookie the board page reads, so the next plain URL renders this view on the server. */
function writeCookie(view: BoardViewMode) {
  document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; SameSite=Lax`;
}

function readCookie(): BoardViewMode | null {
  const pair = document.cookie.split("; ").find((c) => c.startsWith(`${VIEW_COOKIE}=`));
  return parseBoardView(pair?.slice(VIEW_COOKIE.length + 1));
}

function writeStored(view: BoardViewMode) {
  writeCookie(view);
  try {
    window.localStorage.setItem(LS_VIEW, view);
  } catch {
    // Private mode or blocked storage: the URL and the cookie still carry the choice.
  }
}

/**
 * The board's view. The server renders `initial` (`?view=` on the request,
 * else the cookie that mirrors the reader's last choice). Right after
 * hydration the URL wins, so a shared link opens the view it names, even
 * from an offline copy rendered for another URL; a URL without one takes
 * the reader's last choice from localStorage, as the language does, and the
 * address bar is updated to match. Choosing a view writes localStorage and
 * the cookie. A choice stored before the cookie existed is copied into it
 * here, so the next plain URL renders it without a switch after hydration.
 */
export function useBoardView(initial: BoardViewMode): [BoardViewMode, (view: BoardViewMode) => void] {
  const [view, setViewState] = useState<BoardViewMode>(initial);

  useEffect(() => {
    // Deferred so the first client render matches the server HTML, and after
    // the offline check, which asks about the page by the URL it loaded.
    const id = window.setTimeout(() => {
      const fromUrl = parseBoardView(new URLSearchParams(window.location.search).get(PARAM));
      const stored = readStored();
      if (stored && readCookie() !== stored) writeCookie(stored);
      const next = fromUrl ?? stored ?? readCookie();
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
