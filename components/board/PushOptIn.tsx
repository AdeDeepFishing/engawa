"use client";

import { useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { useLang } from "@/lib/i18n/LangProvider";

type State = "hidden" | "off" | "on";
type Note = "denied" | "failed" | null;

/** This device's alert on a board, in this browser only: the language last sent and when. */
interface Mark {
  lang: string;
  at: number;
}

const MARK_PREFIX = "engawa.push.";
/** The page confirms an alert that is on at most this often, which keeps the server's row from expiring (90 days). */
const REFRESH_MS = 24 * 3_600_000;
/** How long the tap waits for the offline worker to be ready. */
const READY_TIMEOUT_MS = 10_000;

function readMark(slug: string): Mark | null {
  try {
    const raw = window.localStorage.getItem(MARK_PREFIX + slug);
    const mark = raw ? (JSON.parse(raw) as Partial<Mark>) : null;
    return mark && typeof mark.lang === "string" && typeof mark.at === "number" ? (mark as Mark) : null;
  } catch {
    return null;
  }
}

function writeMark(slug: string, lang: string): void {
  try {
    window.localStorage.setItem(MARK_PREFIX + slug, JSON.stringify({ lang, at: Date.now() } satisfies Mark));
  } catch {
    // Blocked storage: the alert is on all the same, the page just cannot tell next time.
  }
}

function clearMark(slug: string): void {
  try {
    window.localStorage.removeItem(MARK_PREFIX + slug);
  } catch {
    // ignore
  }
}

/** Whether this browser has alerts on for another board, which share the one subscription the site has. */
function otherBoardsOn(slug: string): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(MARK_PREFIX) && key !== MARK_PREFIX + slug) return true;
    }
  } catch {
    // Blocked storage: assume there may be others, so the subscription is kept.
    return true;
  }
  return false;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/** The offline worker (registered by OfflineSupport), or null when it is not ready in time. */
function readyWorker(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ]);
}

async function postSubscription(slug: string, sub: PushSubscription, lang: string): Promise<Response> {
  return fetch(`/api/b/${slug}/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: getDeviceId(), lang, subscription: sub.toJSON() }),
  });
}

async function notConfigured(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error === "not_configured";
}

/**
 * "Get alerts" (day 7): a quiet toggle on the board that asks this browser
 * for a push notification whenever an official card in danger, notice,
 * shelter or water, or a danger card from the loudspeaker or the city's mail,
 * lands on this board, and when the board switches to disaster mode. Shown
 * only when the browser can do push, the page is online, and the server
 * answers with its public key (lib/push, migration 0010); any "not
 * configured" answer hides it again.
 *
 * The browser has one push subscription for the whole site, shared by every
 * board the reader turns alerts on for; the server keeps one row per board.
 * A tap off removes this board's row, and the subscription itself only when
 * no other board in this browser still uses it.
 */
export function PushOptIn({ boardSlug, offline, configured }: { boardSlug: string; offline: boolean; configured: boolean }) {
  const { lang, t } = useLang();
  const [state, setState] = useState<State>("hidden");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const key = useRef<string | null>(null);

  // On load: is push possible here, configured on the server (the page says so, so no request goes out where it cannot succeed), and already on for this board?
  useEffect(() => {
    if (!supported() || !configured) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/b/${boardSlug}/push/key`);
        if (!res.ok) return;
        const { key: publicKey } = (await res.json()) as { key?: string };
        if (!publicKey || cancelled) return;
        key.current = publicKey;
        const registration = await navigator.serviceWorker.getRegistration();
        const sub = registration ? await registration.pushManager.getSubscription() : null;
        const on = Boolean(sub && readMark(boardSlug) && Notification.permission === "granted");
        if (!on) clearMark(boardSlug);
        if (!cancelled) setState(on ? "on" : "off");
      } catch {
        // Offline or the key route failed: the control stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardSlug, configured]);

  // While on: tell the server the reader's language when it changes, and
  // confirm the alert once a day so its row does not expire.
  useEffect(() => {
    if (state !== "on" || offline) return;
    const mark = readMark(boardSlug);
    if (mark && mark.lang === lang && Date.now() - mark.at < REFRESH_MS) return;
    let cancelled = false;
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = registration ? await registration.pushManager.getSubscription() : null;
      if (!sub || cancelled) return;
      const res = await postSubscription(boardSlug, sub, lang);
      if (res.ok) writeMark(boardSlug, lang);
      else if (await notConfigured(res)) setState("hidden");
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state, lang, boardSlug, offline]);

  async function turnOn() {
    // Asked first, inside the tap: browsers only show the prompt for a user gesture.
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      // Dismissing the prompt is no refusal: only a block says so.
      if (permission === "denied") setNote("denied");
      return;
    }
    const registration = await readyWorker();
    const publicKey = key.current;
    if (!registration || !publicKey) {
      setNote("failed");
      return;
    }
    const serverKey = keyBytes(publicKey);
    let sub = await registration.pushManager.getSubscription();
    let created = false;
    if (sub && !sameKey(sub, serverKey)) {
      // Made with an older key: the push services would refuse it.
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
      created = true;
    }
    const res = await postSubscription(boardSlug, sub, lang);
    if (!res.ok) {
      const off = await notConfigured(res);
      if (created && !otherBoardsOn(boardSlug)) await sub.unsubscribe().catch(() => false);
      if (off) setState("hidden");
      else setNote("failed");
      return;
    }
    writeMark(boardSlug, lang);
    setState("on");
  }

  async function turnOff() {
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = registration ? await registration.pushManager.getSubscription() : null;
    if (sub) {
      const res = await fetch(`/api/b/${boardSlug}/push`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: getDeviceId(), endpoint: sub.endpoint }),
      });
      if (!res.ok && !(await notConfigured(res))) {
        setNote("failed");
        return;
      }
      if (!otherBoardsOn(boardSlug)) await sub.unsubscribe().catch(() => false);
    }
    clearMark(boardSlug);
    setState("off");
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (state === "on") await turnOff();
      else await turnOn();
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden" || offline) return null;
  const on = state === "on";
  const message = note === "denied" ? t("push.denied") : note === "failed" ? t("push.failed") : on ? t("push.explain_on") : t("push.explain_off");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1" data-push-optin={state}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-busy={busy}
        aria-describedby={`push-note-${boardSlug}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-base font-semibold ${
          on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:border-accent active:bg-held-bg"
        }`}
      >
        <span aria-hidden="true">{on ? "🔔✓" : "🔔"}</span>
        {t("push.get_alerts")}
      </button>
      <p
        id={`push-note-${boardSlug}`}
        aria-live="polite"
        className={`min-w-0 flex-1 basis-56 text-base ${note ? "font-semibold text-warn-ink" : "text-muted"}`}
      >
        {message}
      </p>
    </div>
  );
}
