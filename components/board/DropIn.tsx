"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { getDeviceId, hasConsented, setConsented } from "@/lib/device";
import { ImageTooLargeError, prepareImage } from "@/lib/image/browser";
import { readSse } from "@/lib/sse";

export type PendingStatus = "uploading" | "processing" | "done" | "held" | "nothing" | "failed";

export interface PendingItem {
  /** Local key, stable across the upload and processing phases. */
  id: string;
  submissionId?: string;
  status: PendingStatus;
  stage?: string;
  error?: string;
  canRetry?: boolean;
  cardIds?: string[];
  /** One reconcile action per fact from the done event; PendingCard says where a merge went. */
  actions?: string[];
  note?: string | null;
}

/**
 * Maps a refused submission (stable codes from the submissions route) to the
 * error code PendingCard shows as its headline and a friendlier line below it.
 */
function refusal(status: number, body: { error?: string; scope?: string } | null): { error: string; noteKey: MessageKey | null } {
  if (status === 429) return { error: "rate_limited", noteKey: body?.scope === "board" ? "limit.board" : "limit.device" };
  if (status === 503 && body?.error === "busy") return { error: "busy", noteKey: "limit.busy" };
  if (status === 413) return { error: "too_large", noteKey: "limit.too_large" };
  return { error: "generic", noteKey: null };
}

type DoneEvent = {
  status: "done" | "held";
  card_ids: string[];
  public_count: number | null;
  held_count: number | null;
  note_for_uploader: string | null;
  actions?: string[];
};

export function DropIn({
  boardSlug,
  onPending,
  retryRequest,
}: {
  boardSlug: string;
  /** Receives every status change; the parent refreshes the list when a status is done. */
  onPending: (item: PendingItem) => void;
  /** Set by the parent when the user taps retry on a failed item. */
  retryRequest: PendingItem | null;
}) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [mode, setMode] = useState<"choose" | "text">("choose");
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openPanel = () => {
    setNeedsConsent(!hasConsented());
    // Text kept after a refused send opens straight in the text box.
    setMode(text.trim() ? "text" : "choose");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Parent asks us to re-run processing for a failed item.
  const lastRetry = useRef<PendingItem | null>(null);
  useEffect(() => {
    if (retryRequest && retryRequest !== lastRetry.current && retryRequest.submissionId) {
      lastRetry.current = retryRequest;
      void runProcessing(retryRequest.id, retryRequest.submissionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRequest]);

  async function runProcessing(localId: string, submissionId: string) {
    onPending({ id: localId, submissionId, status: "processing", stage: "received" });
    try {
      const res = await fetch(`/api/process/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: getDeviceId() }),
      });
      if (!res.ok || !res.body) {
        const code = res.status === 429 ? "busy" : res.status === 409 ? "already_processing" : "generic";
        onPending({ id: localId, submissionId, status: "failed", error: code, canRetry: code !== "already_processing" });
        return;
      }
      let finished = false;
      await readSse(res.body, (ev) => {
        if (ev.event === "stage") {
          const stage = (ev.data as { stage?: string }).stage;
          onPending({ id: localId, submissionId, status: "processing", stage });
        } else if (ev.event === "done") {
          finished = true;
          const d = ev.data as DoneEvent;
          const publicCount = d.public_count ?? (d.status === "done" ? d.card_ids.length : 0);
          const heldCount = d.held_count ?? (d.status === "held" ? d.card_ids.length : 0);
          const status: PendingStatus = publicCount > 0 ? "done" : heldCount > 0 ? "held" : "nothing";
          onPending({
            id: localId,
            submissionId,
            status,
            cardIds: d.card_ids,
            actions: d.actions,
            note: d.note_for_uploader,
          });
        } else if (ev.event === "failed") {
          finished = true;
          const d = ev.data as { error?: string };
          const note = d.error === "busy" ? t("limit.busy") : null;
          onPending({ id: localId, submissionId, status: "failed", error: d.error, canRetry: true, note });
        }
      });
      if (!finished) {
        onPending({ id: localId, submissionId, status: "failed", error: "generic", canRetry: true });
      }
    } catch {
      onPending({ id: localId, submissionId, status: "failed", error: "generic", canRetry: true });
    }
  }

  /** `sentText` is put back in the text box when a limit refuses it, so nothing typed is lost. */
  async function submit(form: FormData, sentText?: string) {
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onPending({ id: localId, status: "uploading" });
    setOpen(false);
    try {
      form.set("device_id", getDeviceId());
      form.set("consent", "1");
      const res = await fetch(`/api/b/${boardSlug}/submissions`, { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string; scope?: string } | null;
        const { error, noteKey } = refusal(res.status, body);
        const keepText = Boolean(sentText) && (res.status === 429 || res.status === 503);
        if (keepText) setText(sentText as string);
        // Japanese and Chinese sentences run on without a space.
        const gap = lang === "ja" || lang === "zh" ? "" : " ";
        const note = noteKey ? [t(noteKey), keepText ? t("limit.text_kept") : ""].join(gap).trim() : null;
        onPending({ id: localId, status: "failed", error, canRetry: false, note });
        return;
      }
      const { id } = (await res.json()) as { id: string };
      await runProcessing(localId, id);
    } catch {
      onPending({ id: localId, status: "failed", error: "generic", canRetry: false });
    }
  }

  async function onImagePicked(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("kind", "image");
    try {
      const blob = await prepareImage(file);
      form.set("image", blob, "image.jpg");
    } catch (e) {
      const localId = `pending-${Date.now()}`;
      const tooLarge = e instanceof ImageTooLargeError;
      onPending({
        id: localId,
        status: "failed",
        error: tooLarge ? "too_large" : "generic",
        note: tooLarge ? t("limit.too_large") : null,
      });
      setOpen(false);
      return;
    }
    await submit(form);
  }

  async function onTextSend() {
    if (!text.trim()) return;
    const sent = text.trim();
    const form = new FormData();
    form.set("kind", "text");
    form.set("text", sent);
    setText("");
    await submit(form, sent);
  }

  const choice = "flex min-h-14 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-lg font-semibold hover:border-accent";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <button
          type="button"
          onClick={openPanel}
          className="pointer-events-auto min-h-14 rounded-full bg-accent px-8 text-lg font-bold text-accent-ink shadow-lg"
        >
          {t("dropin.button")}
        </button>
      </div>

      {open ? (
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="dropin-title"
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-line bg-surface shadow-2xl"
        >
          <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dropin-title" className="text-xl font-bold">
                {t("dropin.title")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-3 font-semibold"
              >
                {t("dropin.cancel")}
              </button>
            </div>

            {needsConsent ? (
              <div className="mt-4">
                <p className="text-base">{t("dropin.purpose")}</p>
                <button
                  type="button"
                  onClick={() => {
                    setConsented();
                    setNeedsConsent(false);
                  }}
                  className="mt-4 min-h-12 w-full rounded-xl bg-accent px-4 text-lg font-bold text-accent-ink"
                >
                  {t("dropin.purpose_ok")}
                </button>
              </div>
            ) : mode === "choose" ? (
              <div className="mt-4 flex flex-col gap-3">
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => void onImagePicked(e.target.files?.[0])}
                />
                <button type="button" className={choice} onClick={() => cameraRef.current?.click()}>
                  <span aria-hidden="true" className="mr-2">📷</span>
                  {t("dropin.camera")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void onImagePicked(e.target.files?.[0])}
                />
                <button type="button" className={choice} onClick={() => fileRef.current?.click()}>
                  <span aria-hidden="true" className="mr-2">🖼️</span>
                  {t("dropin.choose_image")}
                </button>
                <button type="button" className={choice} onClick={() => setMode("text")}>
                  <span aria-hidden="true" className="mr-2">📝</span>
                  {t("dropin.text")}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("dropin.text_placeholder")}
                  rows={5}
                  autoFocus
                  className="w-full rounded-xl border border-line bg-surface p-3 text-base"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("choose")}
                    className="min-h-12 rounded-xl border border-line px-4 font-semibold"
                  >
                    {t("dropin.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={!text.trim()}
                    onClick={() => void onTextSend()}
                    className="min-h-12 flex-1 rounded-xl bg-accent px-4 text-lg font-bold text-accent-ink disabled:opacity-50"
                  >
                    {t("dropin.send")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
