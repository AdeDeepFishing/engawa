import { after } from "next/server";
import webpush, { WebPushError } from "web-push";
import { db } from "@/lib/db/client";
import { dropSubscriptions, subscriptionsForBoard, touchSubscriptions } from "@/lib/db/push";
import type { Lang } from "@/lib/i18n";
import type { Board } from "@/lib/types";
import { vapid } from "./config";
import {
  alertWorthy,
  cardPayload,
  disasterModePayload,
  newVersion,
  PUSH_TTL_SECONDS,
  type AlertCard,
  type CardChange,
  type PushPayload,
} from "./rules";

/**
 * Sends web push to the devices that opted in on a board, with the `web-push`
 * package (pure JavaScript). Server only. Two senders: the cards a
 * submission wrote (lib/pipeline.ts) and the switch to disaster mode
 * (lib/db/mode.ts). Neither ever throws, and both log counts only: no
 * endpoint, no device, no card text.
 */

/** Messages in flight at once. */
const CONCURRENCY = 10;
/** A push service that has not answered by then counts as failed. */
const TIMEOUT_MS = 10_000;

interface Message {
  payloadFor: (lang: Lang) => PushPayload;
  /** Lets the push service replace an undelivered earlier message of the same card (32 URL-safe characters at most). */
  topic: string;
}

type BoardRef = Pick<Board, "id" | "slug" | "name">;

/**
 * Delivers each message to every subscription of the board, ten at a time.
 * A subscription the push service calls gone (404, 410) is deleted and gets
 * no further message; one that took a message has its last use recorded.
 */
async function deliver(board: BoardRef, messages: Message[], label: string): Promise<void> {
  const keys = vapid();
  if (!keys || messages.length === 0) return;
  const started = performance.now();
  const subs = await subscriptionsForBoard(board.id);
  if (!subs || subs.length === 0) return;

  const bodies = messages.map(() => new Map<Lang, string>());
  const jobs = messages.flatMap((_, m) => subs.map((sub) => ({ m, sub })));
  const delivered = new Set<string>();
  const gone = new Set<string>();
  const failures = new Map<string, number>();
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const { m, sub } = jobs[next++];
      if (gone.has(sub.id)) continue;
      let body = bodies[m].get(sub.lang);
      if (body === undefined) {
        body = JSON.stringify(messages[m].payloadFor(sub.lang));
        bodies[m].set(sub.lang, body);
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          vapidDetails: keys,
          TTL: PUSH_TTL_SECONDS,
          urgency: "high",
          topic: messages[m].topic,
          timeout: TIMEOUT_MS,
        });
        delivered.add(sub.id);
      } catch (err) {
        const status = err instanceof WebPushError ? err.statusCode : 0;
        if (status === 404 || status === 410) gone.add(sub.id);
        else failures.set(String(status || "network"), (failures.get(String(status || "network")) ?? 0) + 1);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  await Promise.all([dropSubscriptions([...gone]), touchSubscriptions([...delivered].filter((id) => !gone.has(id)))]);
  const failed = [...failures].map(([status, n]) => `${n} ${status}`).join(", ");
  console.log(
    `push ${board.slug}: ${label} to ${subs.length} subscriptions, ${delivered.size} delivered, ${gone.size} gone` +
      (failed ? `, failed ${failed}` : "") +
      ` in ${Math.round(performance.now() - started)} ms`,
  );
}

/** A card id or board id without its hyphens: exactly 32 characters, as the topic header allows. */
function topicOf(id: string): string {
  return id.replace(/-/g, "").slice(0, 32);
}

/**
 * Alerts for the cards one submission wrote: every changed card that is a
 * new version (rules.ts newVersion) and, read again now, still alert worthy
 * (public, official in danger, notice, shelter or water, or a danger card
 * from the loudspeaker or the inbox). One notification per card per device,
 * tagged by the card, so an update replaces the earlier one on the phone.
 */
export async function notifyCards(board: BoardRef, changes: CardChange[]): Promise<void> {
  try {
    if (!vapid()) return;
    const ids = changes.filter(newVersion).map((c) => c.card_id);
    if (ids.length === 0) return;
    const { data, error } = await db()
      .from("cards")
      .select("id, category, source_type, visibility, facts, title, body")
      .eq("board_id", board.id)
      .in("id", ids);
    if (error) throw error;
    const cards = ((data ?? []) as AlertCard[]).filter(alertWorthy);
    if (cards.length === 0) return;
    await deliver(
      board,
      cards.map((card) => ({ payloadFor: (lang) => cardPayload(card, board, lang), topic: topicOf(card.id) })),
      cards.length === 1 ? "1 card" : `${cards.length} cards`,
    );
  } catch (err) {
    console.error(`push ${board.slug}: card alerts failed:`, err instanceof Error ? err.message : String(err));
  }
}

/** "Disaster mode on <board>" to every device that opted in on the board. */
export async function notifyDisasterMode(board: BoardRef): Promise<void> {
  try {
    await deliver(board, [{ payloadFor: (lang) => disasterModePayload(board, lang), topic: topicOf(board.id) }], "disaster mode");
  } catch (err) {
    console.error(`push ${board.slug}: disaster mode alert failed:`, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Lets a send started now outlive the response: Next keeps the function
 * alive until it settles (after() takes a promise already running). Outside
 * a request (a script) there is nothing to keep alive and it runs on as is.
 */
export function inBackground(task: Promise<void>): void {
  try {
    after(task);
  } catch {
    // Not inside a request: the promise is already running.
  }
}
