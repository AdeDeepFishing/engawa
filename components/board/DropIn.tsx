"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { getDeviceId, hasConsented, setConsented } from "@/lib/device";
import { boardPolygons, resolveArea } from "@/lib/geo";
import { ImageTooLargeError, prepareImage } from "@/lib/image/browser";
import { readSse } from "@/lib/sse";
import type { Board } from "@/lib/types";

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

/**
 * Self-reported area (G2). The position is read in the browser and mapped to
 * one of the board's 町丁目 polygons right here; only the resolved code is
 * ever sent, and only while the uploader keeps the box ticked.
 */
type AreaState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "resolved"; code: string; name: string }
  | { status: "outside" }
  | { status: "denied" }
  | { status: "failed" };

const AREA_OPT_IN_KEY = "engawa.areaOptIn";
const LOCATE_TIMEOUT_MS = 10_000;
const LOCATE_MAX_AGE_MS = 60_000;

function readAreaOptIn(): boolean {
  try {
    return window.localStorage.getItem(AREA_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAreaOptIn(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(AREA_OPT_IN_KEY, "1");
    else window.localStorage.removeItem(AREA_OPT_IN_KEY);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}

export function DropIn({
  boardSlug,
  areaNames,
  onPending,
  retryRequest,
}: {
  boardSlug: string;
  /** The board's 町丁目 list; the area control appears only when polygons exist for it. */
  areaNames: Board["area_names"];
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
  const [areaOptIn, setAreaOptIn] = useState(false);
  const [area, setArea] = useState<AreaState>({ status: "idle" });
  /** True while a send waits for a position fix still in flight. */
  const [waitingForArea, setWaitingForArea] = useState(false);
  /** The latest area state, readable from the submit path after an await. */
  const areaRef = useRef<AreaState>({ status: "idle" });
  /** The position fix in flight, if any; submit awaits it (it has its own 10 s timeout). */
  const pendingLocate = useRef<Promise<AreaState> | null>(null);
  /** Mirror of `open` for the submit path: closing the panel during the wait cancels the send. */
  const openRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaBoard = useMemo(() => ({ area_names: areaNames }), [areaNames]);
  const hasAreas = useMemo(() => boardPolygons(areaBoard).length > 0, [areaBoard]);

  const openPanel = () => {
    const consented = hasConsented();
    setNeedsConsent(!consented);
    // Text kept after a refused send opens straight in the text box.
    setMode(text.trim() ? "text" : "choose");
    // The area choice is remembered; the position is read again each time, since the phone moves.
    const optIn = hasAreas && readAreaOptIn();
    setAreaOptIn(optIn);
    updateArea({ status: "idle" });
    pendingLocate.current = null;
    // A remembered opt-in starts locating only once the purpose notice is out of
    // the way, so the browser's location prompt never appears over it.
    if (optIn && consented) void locate();
    openRef.current = true;
    setOpen(true);
  };

  const closePanel = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // Parent asks us to re-run processing for a failed item.
  const lastRetry = useRef<PendingItem | null>(null);
  useEffect(() => {
    if (retryRequest && retryRequest !== lastRetry.current && retryRequest.submissionId) {
      lastRetry.current = retryRequest;
      void runProcessing(retryRequest.id, retryRequest.submissionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRequest]);

  function updateArea(state: AreaState) {
    areaRef.current = state;
    setArea(state);
  }

  /** Reads the position and resolves the area. The returned promise settles with the final state, never rejects. */
  function locate(): Promise<AreaState> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const failed: AreaState = { status: "failed" };
      updateArea(failed);
      return Promise.resolve(failed);
    }
    updateArea({ status: "locating" });
    const fix = new Promise<AreaState>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // The coordinates exist only inside this callback: matched against the
          // board's polygons here, never stored, logged or sent.
          const hit = resolveArea(areaBoard, pos.coords.longitude, pos.coords.latitude);
          resolve(hit ? { status: "resolved", code: hit.code, name: hit.name_ja } : { status: "outside" });
        },
        (err) => resolve({ status: err.code === err.PERMISSION_DENIED ? "denied" : "failed" }),
        { enableHighAccuracy: true, timeout: LOCATE_TIMEOUT_MS, maximumAge: LOCATE_MAX_AGE_MS },
      );
    }).then((state) => {
      // Only the most recent request may update the panel; an unticked box drops the result.
      if (pendingLocate.current === fix) {
        pendingLocate.current = null;
        updateArea(state);
      }
      return state;
    });
    pendingLocate.current = fix;
    return fix;
  }

  function onAreaToggle(on: boolean) {
    setAreaOptIn(on);
    writeAreaOptIn(on);
    if (on) {
      void locate();
    } else {
      pendingLocate.current = null;
      updateArea({ status: "idle" });
    }
  }

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
    // A position fix still in flight (at most the 10 s timeout) is awaited
    // first, so a send right after ticking the box still carries the area.
    // Closing the panel meanwhile cancels the send and keeps the text.
    if (areaOptIn && pendingLocate.current) {
      setWaitingForArea(true);
      try {
        await pendingLocate.current;
      } finally {
        setWaitingForArea(false);
      }
      if (!openRef.current) {
        if (sentText) setText(sentText);
        return;
      }
    }
    const areaNow = areaRef.current;
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onPending({ id: localId, status: "uploading" });
    closePanel();
    try {
      form.set("device_id", getDeviceId());
      form.set("consent", "1");
      // Only the area code travels, and only when it resolved; a denied or
      // unresolved position sends nothing about location at all.
      if (areaOptIn && areaNow.status === "resolved") form.set("area_code", areaNow.code);
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
      closePanel();
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

  const areaLine =
    area.status === "locating"
      ? t("area.locating")
      : area.status === "resolved"
        ? t("area.resolved", { area: area.name })
        : area.status === "outside"
          ? t("area.outside")
          : area.status === "denied"
            ? t("area.denied")
            : area.status === "failed"
              ? t("area.failed")
              : "";

  // Opt-in control for the self-reported area, shown with both ways of sending.
  const areaControl = hasAreas ? (
    <div className="mt-4 rounded-xl border border-line bg-held-bg p-3" data-area-control>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={areaOptIn}
          onChange={(e) => onAreaToggle(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-accent"
        />
        <span className="text-base font-semibold">{t("area.opt_in")}</span>
      </label>
      <p className="mt-1 text-base text-muted">{t("area.explain")}</p>
      {areaOptIn ? (
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-base font-semibold" data-area-status={area.status}>
          {areaLine}
        </p>
      ) : null}
    </div>
  ) : null;

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
          className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface shadow-2xl"
        >
          <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dropin-title" className="text-xl font-bold">
                {t("dropin.title")}
              </h2>
              <button
                type="button"
                onClick={closePanel}
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
                    if (areaOptIn) void locate();
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
                <button type="button" className={choice} disabled={waitingForArea} onClick={() => cameraRef.current?.click()}>
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
                <button type="button" className={choice} disabled={waitingForArea} onClick={() => fileRef.current?.click()}>
                  <span aria-hidden="true" className="mr-2">🖼️</span>
                  {t("dropin.choose_image")}
                </button>
                <button type="button" className={choice} onClick={() => setMode("text")}>
                  <span aria-hidden="true" className="mr-2">📝</span>
                  {t("dropin.text")}
                </button>
                {areaControl}
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
                {areaControl}
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
                    disabled={!text.trim() || waitingForArea}
                    aria-busy={waitingForArea}
                    onClick={() => void onTextSend()}
                    className="min-h-12 flex-1 rounded-xl bg-accent px-4 text-lg font-bold text-accent-ink disabled:opacity-50"
                  >
                    {waitingForArea ? t("area.locating") : t("dropin.send")}
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
