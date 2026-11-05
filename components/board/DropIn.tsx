"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { getDeviceId, hasConsented, setConsented } from "@/lib/device";
import { areaName } from "@/lib/cards/display";
import { resolveArea, type AreaFeature, type BoardArea } from "@/lib/geo";
import { ImageTooLargeError, prepareImage } from "@/lib/image/browser";
import { readSse } from "@/lib/sse";
import type { Board } from "@/lib/types";
import { WithAreaName } from "./AreaName";
import { HeardInput } from "./HeardInput";

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

/** Sent when the cards are on the board, before the other languages are translated. */
type CardsEvent = Pick<DoneEvent, "status" | "card_ids">;

/**
 * Fixtures published under public/samples so a judge on the deployed URL can
 * run the real pipeline without printing anything (fixtures/README.md says
 * which fixture each one is). A sample goes down exactly the path a user's
 * own file or text takes: the same compression and metadata strip, the same
 * upload route, the same processing stream, the same rate limits.
 */
type Sample =
  | { id: "paper" | "chat"; kind: "image"; file: string; mime: "image/jpeg" | "image/png"; labelKey: MessageKey; icon: string }
  | { id: "text"; kind: "text"; file: string; labelKey: MessageKey; icon: string };

const SAMPLES: readonly Sample[] = [
  { id: "paper", kind: "image", file: "/samples/notice.jpg", mime: "image/jpeg", labelKey: "sample.paper", icon: "📄" },
  { id: "chat", kind: "image", file: "/samples/chat.png", mime: "image/png", labelKey: "sample.chat", icon: "💬" },
  { id: "text", kind: "text", file: "/samples/text.txt", labelKey: "sample.text", icon: "🗒️" },
];

/**
 * Self-reported area (G2). The position is read in the browser and mapped to
 * one of the board's 町丁目 polygons right here; only the resolved code is
 * ever sent, and only while the uploader keeps the box ticked.
 */
type AreaState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "resolved"; code: string; area: BoardArea }
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
  areaPolygons,
  offline = false,
  onPending,
  retryRequest,
  heardFirst = false,
}: {
  boardSlug: string;
  /** The board's 町丁目 list, for the names of resolved areas. */
  areaNames: Board["area_names"];
  /** This board's polygons from the server (lib/geo/polygons.ts); the area control appears only when there are some. */
  areaPolygons: AreaFeature[];
  /** True while the board cannot reach the server: the button is disabled with a one-line reason. */
  offline?: boolean;
  /** Receives every status change; the parent refreshes the list when a status is done. */
  onPending: (item: PendingItem) => void;
  /** Set by the parent when the user taps retry on a failed item. */
  retryRequest: PendingItem | null;
  /** Disaster mode (N21): "I heard the loudspeaker" comes before the camera, the image and the text. */
  heardFirst?: boolean;
}) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [mode, setMode] = useState<"choose" | "text" | "heard">("choose");
  const [text, setText] = useState("");
  /** Which box the kept text belongs to: pasted text, or what the uploader heard from the loudspeaker. */
  const [textMode, setTextMode] = useState<"text" | "heard">("text");
  const [areaOptIn, setAreaOptIn] = useState(false);
  const [area, setArea] = useState<AreaState>({ status: "idle" });
  /** True while a send waits for a position fix still in flight. */
  const [waitingForArea, setWaitingForArea] = useState(false);
  /** Id of the sample being fetched, so a double tap sends it once. */
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
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
  const hasAreas = areaPolygons.length > 0;

  const openPanel = () => {
    const consented = hasConsented();
    setNeedsConsent(!consented);
    // Text kept after a refused send opens straight in its box.
    setMode(text.trim() ? textMode : "choose");
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
          const hit = resolveArea(areaBoard, areaPolygons, pos.coords.longitude, pos.coords.latitude);
          resolve(hit ? { status: "resolved", code: hit.code, area: hit } : { status: "outside" });
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
        } else if (ev.event === "cards") {
          // The card is written: the parent refreshes the list now, in the
          // languages extract wrote, while the server translates the rest.
          const d = ev.data as CardsEvent;
          onPending({ id: localId, submissionId, status: "processing", stage: "translating", cardIds: d.card_ids });
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

  /** `heard`: the text is what the uploader heard from the loudspeaker; the server tells extract so. */
  async function onTextSend(heard: boolean) {
    if (!text.trim()) return;
    const sent = text.trim();
    const form = new FormData();
    form.set("kind", "text");
    form.set("text", sent);
    if (heard) form.set("heard", "1");
    setText("");
    await submit(form, sent);
  }

  /** Loads a published sample and sends it the way a user's own file or text is sent. */
  async function onSample(sample: Sample) {
    if (sampleLoading) return;
    setSampleLoading(sample.id);
    try {
      const res = await fetch(sample.file);
      if (!res.ok) throw new Error(`sample ${sample.id}: ${res.status}`);
      if (sample.kind === "text") {
        const content = (await res.text()).trim();
        const form = new FormData();
        form.set("kind", "text");
        form.set("text", content);
        // No sentText: a refused sample must not land in the text box as if the user had typed it.
        await submit(form);
      } else {
        const blob = await res.blob();
        const name = sample.file.slice(sample.file.lastIndexOf("/") + 1);
        await onImagePicked(new File([blob], name, { type: sample.mime }));
      }
    } catch {
      onPending({ id: `pending-${Date.now()}`, status: "failed", error: "generic", canRetry: false, note: t("sample.failed") });
      closePanel();
    } finally {
      setSampleLoading(null);
    }
  }

  const choice = "flex min-h-14 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-lg font-semibold hover:border-accent";
  const sampleChoice =
    "flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent disabled:opacity-50";

  // Last of the four choices in everyday mode, first in disaster mode.
  const heardChoice = (
    <button
      type="button"
      className={choice}
      onClick={() => {
        setTextMode("heard");
        setMode("heard");
      }}
      data-dropin-heard
    >
      <span aria-hidden="true" className="mr-2">📢</span>
      {t("dropin.heard")}
    </button>
  );

  const areaLine =
    area.status === "locating"
      ? t("area.locating")
      : area.status === "resolved"
        ? <WithAreaName message="area.resolved" name={areaName(area.area, lang)} lang={lang} />
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
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4">
        {offline ? (
          <p id="dropin-offline" className="rounded-lg bg-warn-bg px-3 py-1 text-center text-base font-semibold text-warn-ink shadow">
            {t("offline.dropin_reason")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={openPanel}
          disabled={offline}
          aria-describedby={offline ? "dropin-offline" : undefined}
          className="pointer-events-auto min-h-14 rounded-full bg-accent px-8 text-lg font-bold text-accent-ink shadow-lg disabled:bg-muted"
          data-dropin-button
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
                {heardFirst ? heardChoice : null}
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
                <button
                  type="button"
                  className={choice}
                  onClick={() => {
                    setTextMode("text");
                    setMode("text");
                  }}
                >
                  <span aria-hidden="true" className="mr-2">📝</span>
                  {t("dropin.text")}
                </button>
                {heardFirst ? null : heardChoice}
                <div className="mt-1 rounded-xl border border-dashed border-line p-3" data-sample-row>
                  <p className="text-base font-semibold">{t("sample.heading")}</p>
                  <p className="mt-1 text-base text-muted">{t("sample.note")}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {SAMPLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={sampleChoice}
                        disabled={sampleLoading !== null || waitingForArea}
                        aria-busy={sampleLoading === s.id}
                        data-sample={s.id}
                        onClick={() => void onSample(s)}
                      >
                        <span aria-hidden="true">{s.icon}</span>
                        {t(s.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                {areaControl}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {mode === "heard" ? (
                  <HeardInput value={text} onChange={setText} />
                ) : (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t("dropin.text_placeholder")}
                    rows={5}
                    autoFocus
                    className="w-full rounded-xl border border-line bg-surface p-3 text-base"
                  />
                )}
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
                    onClick={() => void onTextSend(mode === "heard")}
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
