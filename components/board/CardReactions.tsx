"use client";

import { useState, useSyncExternalStore } from "react";
import {
  myReaction,
  NO_REACTIONS,
  REACTION_KINDS,
  reactionsServerSnapshot,
  reactionsSnapshot,
  rememberReaction,
  subscribeReactions,
} from "@/lib/cards/reactions";
import { getDeviceId } from "@/lib/device";
import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Card, ReactionCounts, ReactionKind } from "@/lib/types";

type Status = "idle" | "sending" | "rate_limited" | "failed";

const ICON: Record<ReactionKind, string> = { still_true: "✓", no_longer_true: "✗" };

function sameCounts(a: ReactionCounts, b: ReactionCounts): boolean {
  return a.still_true === b.still_true && a.no_longer_true === b.no_longer_true;
}

/**
 * "Still true" and "no longer true" (N6): one tap per device, a second tap
 * on the pressed button takes it back, a tap on the other changes it. The
 * device's choice lives in this browser only (lib/cards/reactions.ts); the
 * counts come from the card and, right after a tap, from the route's answer
 * until the card itself brings new counts. Key it by the card id (a key of
 * its own, not the bare id a sibling such as ReadAloud already uses):
 * the sheet is reused across cards and this state belongs to one card.
 */
export function CardReactions({
  card,
  onReacted,
  headingLevel = 3,
}: {
  card: Card;
  onReacted?: () => void;
  /** 3 inside the sheet and the panel; 2 on the card page, under its h1. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { lang, t } = useLang();
  const snapshot = useSyncExternalStore(subscribeReactions, reactionsSnapshot, reactionsServerSnapshot);
  const mine = myReaction(snapshot, card);
  const base = card.reactions ?? NO_REACTIONS;
  // Counts from the last answer, valid while the card still carries the counts it had when the tap was sent.
  const [fresh, setFresh] = useState<{ base: ReactionCounts; counts: ReactionCounts } | null>(null);
  const counts = fresh && sameCounts(fresh.base, base) ? fresh.counts : base;
  const [status, setStatus] = useState<Status>("idle");

  async function tap(kind: ReactionKind) {
    if (status === "sending") return;
    const takeBack = mine === kind;
    setStatus("sending");
    try {
      const res = await fetch(`/api/cards/${card.id}/react`, {
        method: takeBack ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(takeBack ? { device_id: getDeviceId() } : { device_id: getDeviceId(), kind }),
      });
      if (!res.ok) {
        setStatus(res.status === 429 ? "rate_limited" : "failed");
        return;
      }
      setFresh({ base, counts: (await res.json()) as ReactionCounts });
      rememberReaction(card.id, takeBack ? null : kind);
      setStatus("idle");
      onReacted?.();
    } catch {
      setStatus("failed");
    }
  }

  const message = status === "rate_limited" ? t("react.rate_limited") : status === "failed" ? t("react.failed") : "";

  return (
    <section className="mt-5 rounded-xl border border-line p-3" aria-labelledby={`react-${card.id}`} data-reactions>
      <Heading id={`react-${card.id}`} className="font-semibold">
        {t("react.question")}
      </Heading>
      <div className="mt-2 flex flex-wrap gap-2">
        {REACTION_KINDS.map((kind) => {
          const pressed = mine === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={pressed}
              aria-label={`${t(`react.${kind}`)}, ${tCount("react.readers", lang, counts[kind])}`}
              data-reaction={kind}
              onClick={() => tap(kind)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-base font-semibold ${
                pressed ? "border-accent bg-accent text-accent-ink hover:bg-accent-hover" : "border-line bg-surface hover:border-accent active:bg-held-bg"
              }`}
            >
              <span aria-hidden="true">{ICON[kind]}</span>
              <span>{t(`react.${kind}`)}</span>
              <span className="tabular-nums" data-count>
                {counts[kind]}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-base text-muted">{t("react.explain")}</p>
      <p aria-live="polite" className="text-base text-warn-ink">
        {message}
      </p>
    </section>
  );
}
