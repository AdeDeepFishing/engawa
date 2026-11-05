"use client";

import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/**
 * "Alerts" on the admin page: how many devices get web push from this board,
 * and nothing else. No endpoint, device or language ever reaches this page.
 * `count` is null when push is off (no VAPID keys, or migration 0010 missing).
 */
export function PushAdmin({ count }: { count: number | null }) {
  const { lang, t } = useLang();
  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-8" aria-labelledby="push-admin-heading" data-push-admin>
      <h2 id="push-admin-heading" className="text-lg font-bold">
        {t("admin.push_heading")}
      </h2>
      <p className="mt-2 text-base" data-push-count={count ?? "off"}>
        {count === null ? t("admin.push_off") : tCount("admin.push_count", lang, count)}
      </p>
    </section>
  );
}
