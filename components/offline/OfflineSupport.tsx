"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OfflineBanner } from "./OfflineBanner";
import { useLang } from "@/lib/i18n/LangProvider";
import { askServedFromCache, formatSnapshotTime, isOfflinePage, registerOfflineWorker, useOnline } from "@/lib/offline";

/**
 * Mounted once in the root layout: registers the offline worker (public/sw.js)
 * and, on the card and about pages the worker keeps, shows the offline line.
 * The board page has its own, driven by its poll (BoardView).
 */
export function OfflineSupport() {
  const pathname = usePathname();
  useEffect(() => {
    registerOfflineWorker();
  }, []);
  return isOfflinePage(pathname) ? <PageOfflineBanner key={pathname} /> : null;
}

/**
 * Shown while the browser is offline, and on a page whose HTML came from the
 * worker's cache, with the time that copy was stored (else the time the page
 * loaded, which is when its content was current).
 */
function PageOfflineBanner() {
  const { t, lang } = useLang();
  const online = useOnline();
  const [copy, setCopy] = useState<{ fromCache: boolean; at: Date } | null>(null);

  useEffect(() => {
    let live = true;
    void askServedFromCache().then((storedAt) => {
      if (live) setCopy({ fromCache: storedAt !== null, at: storedAt ?? new Date() });
    });
    return () => {
      live = false;
    };
  }, []);

  const show = copy !== null && (copy.fromCache || !online);
  return <OfflineBanner message={show ? t("offline.page_banner", { time: formatSnapshotTime(copy.at, lang) }) : null} />;
}
