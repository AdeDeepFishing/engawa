"use client";

import { useState } from "react";
import { formatFullDateTime } from "@/lib/cards/display";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { InboxAdminState } from "@/lib/db/inbox";

type Answer = { state?: InboxAdminState; secret?: string; error?: string; invalid?: string[] };

/**
 * "Official inbox" on the admin page (docs/INBOX.md): the address a mail
 * forwarder posts to, a bearer secret that is generated here and shown once
 * (only its digest is stored, like the admin token), the sender addresses
 * the inbox accepts, and when the last five mails were accepted, by time
 * only. Replacing a secret takes a second tap, because the forwarder stops
 * working until it gets the new one.
 */
export function InboxAdmin({ slug, inboxUrl, initial }: { slug: string; inboxUrl: string; initial: InboxAdminState }) {
  const { lang, t } = useLang();
  const [state, setState] = useState(initial);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [sendersText, setSendersText] = useState(initial.senders.join("\n"));
  const [busy, setBusy] = useState<"secret" | "senders" | null>(null);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<{ key: MessageKey; invalid?: string } | null>(null);

  async function post(body: Record<string, unknown>): Promise<Answer | null> {
    try {
      const res = await fetch(`/api/b/${slug}/admin/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await res.json().catch(() => ({}))) as Answer;
      if (res.ok) return answer;
      if (answer.error === "invalid_senders") {
        setProblem({ key: "inbox.senders_invalid", invalid: (answer.invalid ?? []).join(", ") });
      } else {
        setProblem({ key: "admin.error" });
      }
      return null;
    } catch {
      setProblem({ key: "admin.error" });
      return null;
    }
  }

  async function newSecret() {
    if (state.has_secret && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setBusy("secret");
    setProblem(null);
    const answer = await post({ action: "new_secret" });
    setBusy(null);
    setConfirmReplace(false);
    if (answer?.secret && answer.state) {
      setSecret(answer.secret);
      setCopied(false);
      setState(answer.state);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // No clipboard permission: the field is selectable by hand.
    }
  }

  async function saveSenders() {
    setBusy("senders");
    setProblem(null);
    setSaved(false);
    const answer = await post({ action: "save_senders", senders: sendersText.split(/[\n,]/) });
    setBusy(null);
    if (answer?.state) {
      setState(answer.state);
      setSendersText(answer.state.senders.join("\n"));
      setSaved(true);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-16" aria-labelledby="inbox-heading" data-inbox-admin>
      <h2 id="inbox-heading" className="text-lg font-bold">
        {t("inbox.heading")}
      </h2>
      <p className="mt-2 text-base">{t("inbox.intro")}</p>
      {!state.available ? (
        <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">{t("inbox.unavailable")}</p>
      ) : (
        <>
          <p className="mt-4 text-base font-semibold">{t("inbox.url_label")}</p>
          <p className="mt-1 break-all rounded-lg border border-line bg-held-bg px-3 py-2 font-mono text-base" data-inbox-url>
            {inboxUrl}
          </p>

          <div className="mt-4 rounded-xl border border-line p-3">
            <p className="text-base font-semibold" data-inbox-secret-state={state.has_secret ? "set" : "none"}>
              {state.has_secret ? t("inbox.secret_set") : t("inbox.secret_none")}
            </p>
            {secret ? (
              <div className="mt-3 flex flex-col gap-2">
                <label htmlFor="inbox-secret" className="text-base font-semibold">
                  {t("inbox.secret_label")}
                </label>
                <input
                  id="inbox-secret"
                  readOnly
                  value={secret}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-base"
                  data-inbox-secret
                />
                <button
                  type="button"
                  onClick={() => void copySecret()}
                  className="self-start rounded-lg border border-line bg-surface px-4 font-semibold"
                >
                  {copied ? t("inbox.copied") : t("inbox.copy")}
                </button>
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-base text-warn-ink">{t("inbox.secret_once")}</p>
              </div>
            ) : null}
            {confirmReplace ? (
              <p role="alert" className="mt-3 text-base text-warn-ink">
                {t("inbox.secret_replace_confirm")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void newSecret()}
              disabled={busy !== null}
              aria-busy={busy === "secret"}
              className="mt-3 rounded-lg bg-accent px-4 font-semibold text-accent-ink disabled:opacity-60"
              data-inbox-new-secret
            >
              {state.has_secret ? (confirmReplace ? t("inbox.secret_replace_now") : t("inbox.secret_replace")) : t("inbox.secret_generate")}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label htmlFor="inbox-senders" className="text-base font-semibold">
              {t("inbox.senders_label")}
            </label>
            <textarea
              id="inbox-senders"
              value={sendersText}
              onChange={(e) => {
                setSendersText(e.target.value);
                setSaved(false);
              }}
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-base"
              data-inbox-senders
            />
            <p className="text-base text-muted">{t("inbox.senders_hint")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void saveSenders()}
                disabled={busy !== null}
                aria-busy={busy === "senders"}
                className="rounded-lg border border-line bg-surface px-4 font-semibold disabled:opacity-60"
                data-inbox-save-senders
              >
                {t("inbox.senders_save")}
              </button>
              {saved ? (
                <span role="status" className="text-base font-semibold" data-inbox-saved>
                  {t("inbox.saved")}
                </span>
              ) : null}
            </div>
          </div>

          {problem ? (
            <p role="alert" className="mt-3 text-base text-warn-ink">
              {problem.invalid !== undefined ? t(problem.key, { list: problem.invalid }) : t(problem.key)}
            </p>
          ) : null}

          <h3 className="mt-6 text-base font-bold">{t("inbox.recent_heading")}</h3>
          {state.recent.length ? (
            <ul className="mt-2 flex flex-col gap-1" data-inbox-recent>
              {state.recent.map((at) => (
                <li key={at}>{formatFullDateTime(at, lang)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">{t("inbox.recent_none")}</p>
          )}
        </>
      )}
    </section>
  );
}
