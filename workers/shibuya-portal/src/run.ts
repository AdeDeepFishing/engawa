/**
 * One run of the poller: read the portal feed, post what is new to the
 * board's inbox oldest first, keep the state in KV. Fetch, KV, the clock and
 * the log are passed in, so test/feed.test.ts runs it without a network.
 *
 * Log lines carry counts, statuses, error codes and update_at values only,
 * never a title or a message.
 */
import {
  afterFailure,
  afterHandled,
  broadcasts,
  classify,
  dueBroadcasts,
  inboxBody,
  LIST_FILE,
  MAX_ATTEMPTS,
  monthFiles,
  needsPreviousMonth,
  nextStep,
  parseFeedJson,
  parseState,
  portalUrl,
  seedState,
  sortBroadcasts,
  type Broadcast,
  type Outcome,
  type State,
} from "./feed";

export const STATE_KEY = "state";
export const LEASE_KEY = "lease";
export const USER_AGENT =
  "engawa-shibuya-portal/1.0 (Engawa neighbourhood board, https://engawaboard.com; reads the broadcast feed every 5 minutes)";
export const PORTAL_TIMEOUT_MS = 15_000;
/**
 * The inbox answers only after its pipeline ran (15 to 30 s, at most the
 * route's 300 s), and it keeps running when the caller hangs up. A shorter
 * timeout would count a broadcast the board did take as failed and post it
 * again on the next run.
 */
export const INBOX_TIMEOUT_MS = 310_000;
/** No new post starts after this, so a run ends inside the 15 minutes a cron run may take. */
export const RUN_BUDGET_MS = 8 * 60_000;
/** Held while a run posts, so a slow run and the next one never post the same broadcast. */
export const LEASE_MS = 15 * 60_000;
export const MAX_POSTS_PER_RUN = 5;

export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RunDeps {
  fetch: typeof fetch;
  store: Store;
  inboxUrl: string;
  inboxSecret: string | undefined;
  sender: string;
  now?: () => number;
  log?: (line: string) => void;
}

export type RunStatus =
  | "seeded"
  | "idle"
  | "done"
  | "stopped"
  | "locked"
  | "portal_error"
  | "no_secret";

export interface RunResult {
  status: RunStatus;
  /** update_at of each broadcast posted in this run, in order. */
  posted: string[];
  state: State | null;
}

export async function runOnce(deps: RunDeps): Promise<RunResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(`shibuya-portal: ${line}`));
  const started = now();
  let state = parseState(await deps.store.get(STATE_KEY));

  const list = await getPortalJson(deps, LIST_FILE);
  if (!list.ok) {
    log(`portal list: ${list.reason}, nothing done`);
    return { status: "portal_error", posted: [], state };
  }
  const files = monthFiles(list.json);
  if (files.length === 0) {
    log("portal list: no month file named, nothing done");
    return { status: "portal_error", posted: [], state };
  }

  const all: Broadcast[] = [];
  let unreadable = 0;
  for (const [i, file] of files.slice(0, 2).entries()) {
    if (i === 1 && !needsPreviousMonth(all, state)) break;
    const month = await getPortalJson(deps, file);
    if (!month.ok) {
      log(`portal month ${i + 1}: ${month.reason}, nothing done`);
      return { status: "portal_error", posted: [], state };
    }
    const read = broadcasts(month.json);
    all.push(...read.broadcasts);
    unreadable += read.unreadable;
  }
  const sorted = sortBroadcasts(all);
  const feedNote = `${sorted.length} broadcasts read${unreadable ? `, ${unreadable} unreadable` : ""}`;

  if (!state) {
    const seeded = seedState(sorted);
    if (!seeded) {
      log(`first run: ${feedNote}, nothing to remember yet`);
      return { status: "idle", posted: [], state: null };
    }
    await deps.store.put(STATE_KEY, JSON.stringify(seeded));
    log(`first run: ${feedNote}, state set to ${seeded.last_update_at}, nothing posted`);
    return { status: "seeded", posted: [], state: seeded };
  }

  const { due, guarded } = dueBroadcasts(state, sorted);
  const guardNote = guarded ? `, ${guarded} held back as already posted` : "";
  if (due.length === 0) {
    log(`${feedNote}, none new since ${state.last_update_at}${guardNote}`);
    return { status: "idle", posted: [], state };
  }
  if (!deps.inboxSecret) {
    log(`${feedNote}, ${due.length} new, ENGAWA_INBOX_SECRET is not set, nothing posted`);
    return { status: "no_secret", posted: [], state };
  }

  const lease = Number((await deps.store.get(LEASE_KEY)) ?? 0);
  if (lease > now()) {
    log(`${feedNote}, ${due.length} new, another run is posting, left for the next run`);
    return { status: "locked", posted: [], state };
  }
  await deps.store.put(LEASE_KEY, String(now() + LEASE_MS), { expirationTtl: LEASE_MS / 1000 + 60 });
  log(`${feedNote}, ${due.length} new since ${state.last_update_at}${guardNote}`);

  const posted: string[] = [];
  let status: RunStatus = "done";
  try {
    for (const [i, b] of due.entries()) {
      if (posted.length >= MAX_POSTS_PER_RUN || now() - started > RUN_BUDGET_MS) {
        log(`${due.length - i} left for the next run`);
        break;
      }
      const step = nextStep(state, b, now());
      if (step !== "post") {
        const why =
          step === "too_old"
            ? "older than 24 hours, not posted"
            : `given up after ${MAX_ATTEMPTS} failed posts (last error ${state.failing?.error ?? "unknown"})`;
        state = afterHandled(state, b);
        await deps.store.put(STATE_KEY, JSON.stringify(state));
        log(`passed over ${b.updateAt}: ${why}`);
        continue;
      }
      const outcome = await postToInbox(deps, b);
      if (outcome.kind === "posted") {
        state = afterHandled(state, b);
        await deps.store.put(STATE_KEY, JSON.stringify(state));
        posted.push(b.updateAt);
        log(`posted ${b.updateAt}: 201, ${outcome.cards} card${outcome.cards === 1 ? "" : "s"}`);
        continue;
      }
      status = "stopped";
      if (outcome.kind === "failed") {
        state = afterFailure(state, b, outcome.error);
        await deps.store.put(STATE_KEY, JSON.stringify(state));
        log(
          `stopped at ${b.updateAt}: ${outcome.status} ${outcome.error}, attempt ${state.failing?.attempts} of ${MAX_ATTEMPTS}, retried next run`,
        );
      } else if (outcome.kind === "busy") {
        log(`stopped at ${b.updateAt}: ${outcome.status} ${outcome.error}, retried next run`);
      } else {
        log(`stopped at ${b.updateAt}: ${outcome.status} ${outcome.error}, check the inbox secret and the allowed senders`);
      }
      break;
    }
  } finally {
    await deps.store.delete(LEASE_KEY);
  }
  return { status, posted, state };
}

type PortalResult = { ok: true; json: unknown } | { ok: false; reason: string };

async function getPortalJson(deps: RunDeps, file: string): Promise<PortalResult> {
  let res: Response;
  try {
    res = await deps.fetch(portalUrl(file), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: isTimeout(e) ? "timeout" : "network error" };
  }
  if (!res.ok) return { ok: false, reason: `status ${res.status}` };
  try {
    return { ok: true, json: parseFeedJson(await res.text()) };
  } catch {
    return { ok: false, reason: "not JSON" };
  }
}

async function postToInbox(deps: RunDeps, b: Broadcast): Promise<Outcome> {
  try {
    const res = await deps.fetch(deps.inboxUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Authorization: `Bearer ${deps.inboxSecret}`,
      },
      body: JSON.stringify(inboxBody(b, deps.sender)),
      signal: AbortSignal.timeout(INBOX_TIMEOUT_MS),
    });
    return classify(res.status, await res.text());
  } catch (e) {
    return { kind: "failed", status: 0, error: isTimeout(e) ? "timeout" : "network_error" };
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}
