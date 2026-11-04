import { useSyncExternalStore } from "react";
import { formatDateTime, formatTime } from "@/lib/cards/display";
import type { Lang } from "@/lib/i18n";

/**
 * Browser side of the offline snapshot (N9). The worker itself is
 * public/sw.js; these names and paths must match it.
 */

/** Header on a response the worker answered from its cache instead of the network. */
export const FROM_CACHE_HEADER = "x-engawa-from-cache";

/** Pages the worker keeps (besides the board, which shows its own banner): card pages, their notice, about. */
const OFFLINE_PAGE = [/^\/b\/[^/]+\/c\/[^/]+(?:\/notice)?\/?$/, /^\/about\/?$/];

export function isOfflinePage(pathname: string): boolean {
  return OFFLINE_PAGE.some((re) => re.test(pathname));
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** What the browser reports. True on the server and during hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Registers the worker; on a page loaded before the worker existed, hands it this page and its build files to keep. */
export function registerOfflineWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  const wasControlled = sw.controller !== null;
  // `next dev` serves unhashed chunks: the worker keeps them network first there.
  const url = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
  sw.register(url, { scope: "/" })
    .then(() => sw.ready)
    .then((registration) => {
      if (wasControlled) return;
      const files = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(location.origin));
      registration.active?.postMessage({ type: "engawa:warm", urls: [pageUrl(), ...files] });
    })
    .catch(() => {
      // No worker (private mode, blocked storage): the board simply needs the network.
    });
}

function pageUrl(): string {
  return location.href.split("#")[0];
}

/**
 * Asks the worker whether this page's HTML came from its cache. Resolves to
 * the time that copy was stored, or null when the page came from the network
 * (or there is no worker, or it does not answer within a second).
 */
export function askServedFromCache(): Promise<Date | null> {
  const controller = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 1_000);
    channel.port1.onmessage = (event: MessageEvent<{ fromCache?: boolean; storedAt?: string | null }>) => {
      window.clearTimeout(timer);
      // The worker stamps every copy it stores, so a copy without a time does not occur.
      const storedAt = event.data?.fromCache && event.data.storedAt ? new Date(event.data.storedAt) : null;
      resolve(storedAt && !Number.isNaN(storedAt.getTime()) ? storedAt : null);
    };
    controller.postMessage({ type: "engawa:cache-status", url: pageUrl() }, [channel.port2]);
  });
}

/** "14:05" when the snapshot is from today in Japan, "11/3 14:05" otherwise. */
export function formatSnapshotTime(at: Date, lang: Lang): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  const iso = at.toISOString();
  return day(at) === day(new Date()) ? formatTime(iso, lang) : formatDateTime(iso, lang);
}
