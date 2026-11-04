/**
 * The 渋谷区防災ポータル broadcast feed and the inbox post, as pure functions:
 * reading the list and month files, ordering the broadcasts, deciding what a
 * run posts, building the inbox body and reading the inbox's answer. No I/O;
 * src/run.ts fetches and writes KV, test/feed.test.ts checks both.
 *
 * Feed shape (read 2026-11-04):
 *   list   {Update_At, BosaiRadioList: {content: [{month: "202610", filename: "renkei_73_bosai_radio_202610.js"}]}}
 *   month  {Update_At, BosaiRadio: {month, information: [{update_at: "2026/10/16 12:40", title, message,
 *          url, important, multi_lang: {ja, en, "zh-cn", "zh-tw", ko, fr: {title, message, attachments}}}]}}
 * The list names only months that had a broadcast, newest first.
 */

export const PORTAL_BASE = "https://bosai.city.shibuya.tokyo.jp/apps/get_json.php?file=";
export const LIST_FILE = "renkei_73_bosai_radio_list.js";
const MONTH_FILE = /^renkei_73_bosai_radio_(\d{6})\.js$/;

/** The last posted keys kept in KV, the second guard against posting a broadcast twice. */
export const MAX_POSTED_KEYS = 20;
/** Failed posts of one broadcast before the poller moves past it (README, "When a post fails"). */
export const MAX_ATTEMPTS = 3;
/**
 * A broadcast older than this when its turn comes is not posted. The inbox
 * ignores a received_at older than 24 hours and reads 本日 against the time
 * of the request, so an old alert would come out as today's.
 */
export const MAX_AGE_MS = 24 * 3_600_000;
/** Kept well under the inbox's 20 KB body limit, at three bytes per Japanese character. */
const MAX_TEXT_CHARS = 4000;
const MAX_ENGLISH_CHARS = 1500;

export interface Broadcast {
  /** The portal's time as written, for example "2026/10/16 12:40". */
  updateAt: string;
  /** The same time in ISO 8601 at +09:00. Sorts as text. */
  receivedAt: string;
  /** update_at plus a hash of the Japanese title and message, so two broadcasts in one minute stay apart. */
  key: string;
  title: string;
  message: string;
  english: string;
}

export interface State {
  /** update_at of the newest broadcast posted (or seen on the first run), as the portal writes it. */
  last_update_at: string;
  /** Keys of the last broadcasts posted or passed over, newest last. */
  posted: string[];
  /** The broadcast whose post failed last, how many times in a row, and the inbox's error code. */
  failing?: { key: string; attempts: number; error: string };
}

export function portalUrl(file: string): string {
  return PORTAL_BASE + encodeURIComponent(file);
}

/** The portal's JSON, which may come with a text content type and a byte order mark. */
export function parseFeedJson(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, ""));
}

/**
 * The month files the list names, newest first. A name that does not look
 * like a month file is dropped, so the feed cannot point the worker elsewhere.
 */
export function monthFiles(list: unknown): string[] {
  const content = (list as { BosaiRadioList?: { content?: unknown } } | null)?.BosaiRadioList?.content;
  if (!Array.isArray(content)) return [];
  const files: { file: string; month: string }[] = [];
  for (const item of content) {
    const file = (item as { filename?: unknown } | null)?.filename;
    const match = typeof file === "string" ? MONTH_FILE.exec(file) : null;
    if (match && !files.some((f) => f.file === file)) files.push({ file: match[0], month: match[1] });
  }
  return files.sort((a, b) => b.month.localeCompare(a.month)).map((f) => f.file);
}

/**
 * "2026/10/16 12:40" read as Japan time, in ISO 8601: "2026-10-16T12:40:00+09:00".
 * Null when the value is not a plausible date and time.
 */
export function jstIso(updateAt: string): string | null {
  const m = /^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(updateAt);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${year}-${two(month)}-${two(day)}T${two(hour)}:${two(minute)}:${two(second)}+09:00`;
}

/**
 * The broadcasts of one month file, in the feed's order, and how many items
 * were left out because their update_at could not be read.
 */
export function broadcasts(month: unknown): { broadcasts: Broadcast[]; unreadable: number } {
  const info = (month as { BosaiRadio?: { information?: unknown } } | null)?.BosaiRadio?.information;
  if (!Array.isArray(info)) return { broadcasts: [], unreadable: 0 };
  const out: Broadcast[] = [];
  let unreadable = 0;
  for (const raw of info) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const langs = (item.multi_lang ?? {}) as Record<string, { title?: unknown; message?: unknown } | undefined>;
    const updateAt = str(item.update_at).trim();
    const receivedAt = jstIso(updateAt);
    if (!receivedAt) {
      unreadable++;
      continue;
    }
    const title = (str(langs.ja?.title) || str(item.title)).trim();
    const message = normalizeText(str(langs.ja?.message) || str(item.message));
    if (!title && !message) {
      unreadable++;
      continue;
    }
    out.push({
      updateAt,
      receivedAt,
      key: `${updateAt}#${fnv1a(`${title}\n${message}`)}`,
      title,
      message,
      english: normalizeText(str(langs.en?.message)),
    });
  }
  return { broadcasts: out, unreadable };
}

/**
 * Oldest first. Broadcasts in the same minute keep the reverse of the feed's
 * order, since the portal lists newest first.
 */
export function sortBroadcasts(list: readonly Broadcast[]): Broadcast[] {
  return [...list].reverse().sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0));
}

/**
 * Whether the run must also read the month before the newest: when the
 * newest has no broadcast, or when even its oldest broadcast is newer than
 * the stored time, so broadcasts of the month before may still be waiting.
 */
export function needsPreviousMonth(newest: readonly Broadcast[], state: State | null): boolean {
  if (newest.length === 0) return true;
  if (!state) return false;
  const last = jstIso(state.last_update_at);
  return last !== null && sortBroadcasts(newest)[0].receivedAt > last;
}

export function parseState(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<State>;
    if (typeof value.last_update_at !== "string" || !jstIso(value.last_update_at)) return null;
    const posted = Array.isArray(value.posted) ? value.posted.filter((k): k is string => typeof k === "string") : [];
    const f = value.failing;
    const failing =
      f && typeof f.key === "string" && typeof f.attempts === "number" && typeof f.error === "string"
        ? { key: f.key, attempts: f.attempts, error: f.error }
        : undefined;
    return { last_update_at: value.last_update_at, posted: posted.slice(-MAX_POSTED_KEYS), ...(failing ? { failing } : {}) };
  } catch {
    return null;
  }
}

/**
 * The first run: remember the newest broadcast (and any others of the same
 * minute) and post nothing, so old broadcasts never become cards.
 * Null when the feed had no broadcast to remember.
 */
export function seedState(sorted: readonly Broadcast[]): State | null {
  const newest = sorted.at(-1);
  if (!newest) return null;
  const sameMinute = sorted.filter((b) => b.receivedAt === newest.receivedAt).map((b) => b.key);
  return { last_update_at: newest.updateAt, posted: sameMinute.slice(-MAX_POSTED_KEYS) };
}

/**
 * The broadcasts this run still owes the inbox, oldest first: those at or
 * after the stored time whose key was not posted. `guarded` counts the ones
 * newer than the stored time that the key list held back (a second run that
 * read an old state).
 */
export function dueBroadcasts(state: State, sorted: readonly Broadcast[]): { due: Broadcast[]; guarded: number } {
  const last = jstIso(state.last_update_at) ?? "";
  const due: Broadcast[] = [];
  let guarded = 0;
  for (const b of sorted) {
    if (b.receivedAt < last) continue;
    if (state.posted.includes(b.key)) {
      if (b.receivedAt > last) guarded++;
      continue;
    }
    due.push(b);
  }
  return { due, guarded };
}

export type Step = "post" | "too_old" | "given_up";

/** What to do with the next due broadcast. */
export function nextStep(state: State, b: Broadcast, nowMs: number): Step {
  if (nowMs - Date.parse(b.receivedAt) > MAX_AGE_MS) return "too_old";
  if (state.failing?.key === b.key && state.failing.attempts >= MAX_ATTEMPTS) return "given_up";
  return "post";
}

/** The state after a 201, or after the run passed a broadcast over (too old, given up). */
export function afterHandled(state: State, b: Broadcast): State {
  const posted = [...state.posted.filter((k) => k !== b.key), b.key].slice(-MAX_POSTED_KEYS);
  return { last_update_at: b.updateAt, posted };
}

/** The state after a failed post: the broadcast is still owed, one more attempt is counted. */
export function afterFailure(state: State, b: Broadcast, error: string): State {
  const attempts = state.failing?.key === b.key ? state.failing.attempts + 1 : 1;
  return { ...state, failing: { key: b.key, attempts, error } };
}

export interface InboxBody {
  from: string;
  subject: string;
  text: string;
  received_at: string;
}

/**
 * The inbox body: the Japanese title as the subject, the Japanese message
 * as the text (the title when the message is empty), and one line with the
 * English only when it carries a number or link the Japanese lacks. The
 * board writes its own translations, so a plain translation adds nothing.
 */
export function inboxBody(b: Broadcast, sender: string): InboxBody {
  let text = (b.message || b.title).slice(0, MAX_TEXT_CHARS);
  if (englishAddsFacts(b.message, b.english)) text += `\n英語: ${oneLine(b.english).slice(0, MAX_ENGLISH_CHARS)}`;
  return { from: sender, subject: b.title, text, received_at: b.receivedAt };
}

/**
 * Whether the English says something the Japanese does not: it is real
 * English (not a copy of the Japanese, as the portal sometimes leaves in a
 * language field) and carries a number other than zero, or a link, that the
 * Japanese lacks. A 12 hour time ("3 p.m." beside 15時) counts as a
 * difference; one extra line then reaches the board, which is harmless.
 */
export function englishAddsFacts(ja: string, en: string): boolean {
  const english = oneLine(en);
  if (!english) return false;
  const latin = english.match(/[A-Za-z]/g)?.length ?? 0;
  const cjk = english.match(/[぀-ヿ㐀-鿿]/g)?.length ?? 0;
  if (latin <= cjk) return false;
  const japanese = toHalfWidth(ja);
  if (!japanese.trim()) return true;
  const jaNumbers = numbers(japanese);
  if ([...numbers(english)].some((n) => !jaNumbers.has(n))) return true;
  return (english.match(/https?:\/\/[^\s)]+/g) ?? []).some((link) => !japanese.includes(link));
}

export type Outcome =
  | { kind: "posted"; cards: number }
  /** 429 or 503: the board is busy. Stop, try again next run, no attempt counted. */
  | { kind: "busy"; status: number; error: string }
  /** 403: the secret or the allowed sender list is not set up. Stop, no attempt counted. */
  | { kind: "refused"; status: number; error: string }
  /** Anything else, a network error or a timeout (status 0). Stop, one attempt counted. */
  | { kind: "failed"; status: number; error: string };

/** The inbox's answer, read from the status and the body text. */
export function classify(status: number, bodyText: string): Outcome {
  const body = safeJson(bodyText);
  if (status === 201) {
    const cards = Array.isArray((body as { card_ids?: unknown } | null)?.card_ids)
      ? (body as { card_ids: unknown[] }).card_ids.length
      : 0;
    return { kind: "posted", cards };
  }
  const error = errorCode(body);
  if (status === 429 || status === 503) return { kind: "busy", status, error };
  if (status === 403) return { kind: "refused", status, error };
  return { kind: "failed", status, error };
}

/** The inbox's `error` value when it is a short code; never free text in a log line. */
function errorCode(body: unknown): string {
  const value = (body as { error?: unknown } | null)?.error;
  return typeof value === "string" && /^[A-Za-z0-9_]{1,40}$/.test(value) ? value : "unknown";
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Line ends to \n, trailing spaces off each line, blank runs to one, trimmed. */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Full width digits, letters and punctuation to ASCII, so １５時 and 15時 compare equal. */
function toHalfWidth(text: string): string {
  return text.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** The numbers in a text without leading zeros, zero itself left out ("10:00" gives 10). */
function numbers(text: string): Set<string> {
  const found = text.match(/\d+/g) ?? [];
  return new Set(found.map((n) => n.replace(/^0+/, "")).filter(Boolean));
}

/** FNV-1a, 32 bits, as 8 hex digits. Enough to tell apart two broadcasts of one minute. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
