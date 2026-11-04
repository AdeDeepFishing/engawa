"use client";

import { useCallback, useSyncExternalStore, type RefObject } from "react";

/**
 * DropIn (another module) owns its open state. On a laptop the board opens
 * it from a top bar button instead of the floating one, through two hooks
 * DropIn keeps stable: the floating button carries `data-dropin-button`, and
 * the open panel is a `section[role="dialog"]`. BoardView wraps DropIn in an
 * element with `data-dropin-host`; globals.css restyles both inside it.
 * A prop on DropIn would replace this (listed in the DEVLOG).
 */
const BUTTON = "[data-dropin-button]";
const PANEL = ':scope > section[role="dialog"]';

/** Presses DropIn's own button, hidden or not. False when it is missing or disabled (offline). */
export function openDropIn(host: HTMLElement | null): boolean {
  const button = host?.querySelector<HTMLButtonElement>(BUTTON);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

export function dropInPanel(host: HTMLElement | null): HTMLElement | null {
  return host?.querySelector<HTMLElement>(PANEL) ?? null;
}

/** True while DropIn's panel is in the page, read from the host's children as an external store. */
export function useDropInOpen(hostRef: RefObject<HTMLElement | null>): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const host = hostRef.current;
      if (!host) return () => {};
      const observer = new MutationObserver(onChange);
      observer.observe(host, { childList: true });
      return () => observer.disconnect();
    },
    [hostRef],
  );
  return useSyncExternalStore(
    subscribe,
    () => dropInPanel(hostRef.current) !== null,
    () => false,
  );
}
