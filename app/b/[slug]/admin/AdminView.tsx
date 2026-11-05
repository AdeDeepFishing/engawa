"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { TopBar } from "@/components/TopBar";
import { ModeAdmin } from "@/components/admin/ModeAdmin";
import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import {
  conflictStatements,
  placeLabel,
  platformLabel,
  sourceLabel,
  supersededStatements,
  timeAgo,
} from "@/lib/cards/display";
import type { ModeView } from "@/lib/cards/mode";
import { tCount, type MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { AdminAction, AdminCard, AdminCardLists } from "@/lib/db/admin";
import { RISK_FLAGS, type Board, type RiskFlag } from "@/lib/types";

const ACTION_KEYS: Record<AdminAction, MessageKey> = {
  publish: "admin.publish",
  hide: "admin.hide",
  hide_as_duplicate: "admin.hide_as_duplicate",
  confirm_official: "admin.confirm_official",
  unconfirm_official: "admin.unconfirm_official",
};

export function InvalidAdminLink() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t("admin.title")} />
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <p className="text-lg">{t("admin.invalid_token")}</p>
      </main>
    </>
  );
}

export function AdminView({
  board,
  lists,
  serverNow,
  mode,
}: {
  board: Board;
  lists: AdminCardLists;
  serverNow: string;
  /** The board's mode, when and why it last changed (N21). */
  mode: ModeView;
}) {
  const { lang, t } = useLang();
  const now = new Date(serverNow);
  const item = (card: AdminCard, actions: AdminAction[]) => (
    <AdminCardItem
      key={card.id}
      card={card}
      board={board}
      now={now}
      actions={actions}
      duplicateTargets={card.visibility === "public" ? lists.public.filter((c) => c.id !== card.id) : []}
    />
  );
  return (
    <>
      <TopBar title={`${board.name[lang]}: ${t("admin.title")}`} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">{t("admin.private_note")}</p>
        <p className="mt-3">
          <Link href={`/b/${board.slug}`} className="tap inline-flex items-center font-semibold text-accent underline">
            {t("admin.open_board")}
          </Link>
        </p>

        <ModeAdmin slug={board.slug} initial={mode} serverNow={serverNow} />

        <Section title={`${t("admin.held_heading")} (${lists.held.length})`}>
          {lists.held.length ? (
            lists.held.map((c) => item(c, ["publish", "hide"]))
          ) : (
            <p className="text-muted">{t("admin.held_empty")}</p>
          )}
        </Section>

        <Section title={`${t("admin.public_heading")} (${lists.public.length})`}>
          {lists.public.length ? (
            lists.public.map((c) => item(c, [c.official_confirmed ? "unconfirm_official" : "confirm_official", "hide"]))
          ) : (
            <p className="text-muted">{t("admin.none")}</p>
          )}
        </Section>

        <details className="mt-8">
          <summary className="cursor-pointer py-2 text-lg font-bold">
            {t("admin.hidden_heading")} ({lists.hidden.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {lists.hidden.length ? (
              lists.hidden.map((c) => item(c, ["publish"]))
            ) : (
              <li className="text-muted">{t("admin.none")}</li>
            )}
          </ul>
        </details>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-2 flex flex-col gap-3">{children}</ul>
    </section>
  );
}

/** Risk flags or the reconcile reason, in the reader's language where we have one. */
function heldReasons(card: AdminCard, t: (key: MessageKey) => string): string[] {
  const raw = card.held_reason ?? (card.risk_flags ?? []).join(",");
  if (raw.startsWith("reconcile:")) return [`${t("admin.reason.reconcile")}: ${raw.slice("reconcile:".length).trim()}`];
  return raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => ((RISK_FLAGS as readonly string[]).includes(f) ? t(`admin.reason.${f as RiskFlag}`) : f));
}

function AdminCardItem({
  card,
  board,
  now,
  actions,
  duplicateTargets,
}: {
  card: AdminCard;
  board: Board;
  now: Date;
  actions: AdminAction[];
  /** Public cards this card may be hidden as a duplicate of (empty when the card is not public). */
  duplicateTargets: AdminCard[];
}) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState<AdminAction | null>(null);
  const [failed, setFailed] = useState<MessageKey | null>(null);
  const [target, setTarget] = useState("");
  const [refreshing, startTransition] = useTransition();
  const place = placeLabel(card, board, lang);
  const reasons = card.visibility === "held" ? heldReasons(card, t) : [];
  const flags = [
    conflictStatements(card).length ? t("conflict.label") : null,
    supersededStatements(card).length ? t("card.updated") : null,
    isExpired(card.valid_until, now) ? t("card.outdated") : null,
  ].filter(Boolean);

  async function run(action: AdminAction) {
    setBusy(action);
    setFailed(null);
    try {
      // The admin cookie goes along with the request; no token in the body.
      const res = await fetch(`/api/b/${board.slug}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "hide_as_duplicate"
            ? { card_id: card.id, action, target_card_id: target }
            : { card_id: card.id, action },
        ),
      });
      // 409: the chosen original is not a public card of this board (any more).
      if (res.status === 409) throw new Error("duplicate_target");
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => router.refresh());
    } catch (e) {
      setFailed(e instanceof Error && e.message === "duplicate_target" ? "admin.duplicate_target_invalid" : "admin.error");
    } finally {
      setBusy(null);
    }
  }

  // "Unhide" for a hidden card is the publish action under a clearer name.
  const labelOf = (action: AdminAction): MessageKey =>
    action === "publish" && card.visibility === "hidden" ? "admin.unhide" : ACTION_KEYS[action];
  const selectId = `dup-target-${card.id}`;

  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl leading-none">
          {CATEGORY_ICON[card.category]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-muted">{t(`category.${card.category}`)}</p>
          <h3 className="mt-0.5 text-lg font-bold leading-snug">{card.title[lang]}</h3>
          {place ? <p className="mt-1">{place}</p> : null}
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-base text-muted">
            <span>{timeAgo(card.created_at, now, lang)}</span>
            <span>{sourceLabel(card.source_type, card.official_confirmed, lang, card.facts.platform)}</span>
            <span>{tCount("card.source_count", lang, card.source_count)}</span>
            {card.facts.platform && card.facts.platform !== "unknown" ? (
              <span>{platformLabel(card.facts.platform, lang)}</span>
            ) : null}
          </p>
          {flags.length ? <p className="mt-1 text-base font-semibold text-warn-ink">{flags.join(" · ")}</p> : null}
          {reasons.length ? (
            <p className="mt-2 rounded-md bg-warn-bg px-2 py-1 text-warn-ink">
              {t("admin.held_reason")}: {reasons.join(", ")}
            </p>
          ) : null}
          <p className="mt-2">{card.body[lang]}</p>
          {card.visibility === "hidden" && card.duplicate_of ? (
            <p className="mt-2 rounded-md bg-held-bg px-2 py-1">
              <span className="text-muted">{t("card.duplicate_of_prefix")}: </span>
              <span className="font-semibold">{card.original ? card.original.title[lang] : card.duplicate_of}</span>
            </p>
          ) : null}
          {card.visibility === "held" && card.original_text ? (
            <details className="mt-2 rounded-lg border border-line p-2">
              <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">{t("sheet.original")}</summary>
              <p lang={card.original_lang ?? undefined} className="mt-1 whitespace-pre-wrap text-muted">
                {card.original_text}
              </p>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={busy !== null || refreshing}
                onClick={() => void run(action)}
                aria-busy={busy === action}
                className={`rounded-lg px-4 font-semibold disabled:opacity-60 ${
                  action === "publish" || action === "confirm_official"
                    ? "bg-accent text-accent-ink"
                    : "border border-line bg-surface"
                }`}
              >
                {t(labelOf(action))}
              </button>
            ))}
          </div>
          {card.visibility === "public" ? (
            <details className="mt-3 rounded-lg border border-line p-2">
              <summary className="cursor-pointer py-2 font-semibold">{t("admin.hide_as_duplicate")}</summary>
              {duplicateTargets.length ? (
                <div className="mt-2 flex flex-col gap-2">
                  <label htmlFor={selectId} className="font-medium">
                    {t("admin.duplicate_target")}
                  </label>
                  <select
                    id={selectId}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 text-base"
                  >
                    <option value="">{t("admin.duplicate_target_pick")}</option>
                    {duplicateTargets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {CATEGORY_ICON[c.category]} {c.title[lang]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!target || busy !== null || refreshing}
                    onClick={() => void run("hide_as_duplicate")}
                    aria-busy={busy === "hide_as_duplicate"}
                    className="self-start rounded-lg border border-line bg-surface px-4 font-semibold disabled:opacity-60"
                  >
                    {t("admin.hide_as_duplicate")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-muted">{t("admin.duplicate_target_none")}</p>
              )}
            </details>
          ) : null}
          {failed ? (
            <p role="alert" className="mt-2 text-warn-ink">
              {t(failed)}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
