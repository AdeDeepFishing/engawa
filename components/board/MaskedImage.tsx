"use client";

import { useLang } from "@/lib/i18n/LangProvider";

/**
 * The masked copy of a chat screenshot: every avatar, name, handle, phone
 * and room number is painted over before the copy is stored, and the
 * original is deleted. Mounted in the card sheet's original text section
 * when `card.has_masked_image` is set; the route serves public cards only.
 */
export function MaskedImage({ cardId }: { cardId: string }) {
  const { t } = useLang();
  return (
    <figure className="mt-3">
      {/* A plain img: the route handler streams the object, there is no public URL to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/cards/${cardId}/masked`}
        alt={t("mask.alt")}
        loading="lazy"
        decoding="async"
        className="w-full rounded-xl border border-line bg-surface"
      />
      <figcaption className="mt-2 text-base text-muted">{t("mask.caption")}</figcaption>
    </figure>
  );
}
