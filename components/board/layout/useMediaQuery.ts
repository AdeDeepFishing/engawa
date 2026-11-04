"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Where the board stops being one phone column: two columns from here, three from LAPTOP_MIN. */
export const TABLET_QUERY = "(min-width: 768px)";
export const LAPTOP_QUERY = "(min-width: 1024px)";

/**
 * Whether a media query matches, read as an external store. False on the
 * server and in the hydration render, so the HTML matches; the real value
 * follows right after. Layout itself is CSS; this only decides what CSS
 * cannot, such as whether a selected card opens as a sheet or in the panel.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
