import type { BoardMode, Card, Category, Platform, ReconcileAction, SourceType, Visibility } from "@/lib/types";

/**
 * Board mode as a state (N21): the rules that switch it and what changes on
 * the board when it is `disaster`. Pure, shared by the server (lib/db/mode.ts,
 * lib/pipeline.ts) and the board, and covered by `pnpm check:mode`.
 */

/** Why the mode last changed, as stored in `boards.mode_reason` (migration 0009). */
export type ModeReason = "admin" | "auto_return" | `inbox:${string}`;

/** The reason as readers and the admin page get it: the kind only, never the submission id. */
export type ModeReasonKind = "admin" | "inbox" | "auto_return";

/** The mode as the board page and the 5 second poll carry it. */
export interface ModeView {
  mode: BoardMode;
  /** When the mode last changed; null when it never changed through the app. */
  since: string | null;
  reason: ModeReasonKind | null;
}

export function reasonKind(reason: string | null | undefined): ModeReasonKind | null {
  if (reason === "admin" || reason === "auto_return") return reason;
  if (reason?.startsWith("inbox:")) return "inbox";
  return null;
}

// --- switching on: the official inbox ------------------------------------------

/**
 * Categories whose official cards can switch a board on, and whose absence
 * switches it back. `shelter` is here beside `danger` and `official_notice`
 * because extract files an evacuation order that names where to go as a
 * shelter card: on the acceptance board on 2026-11-04 the city's mail
 * "警戒レベル4、避難指示 ... 小杉小学校へ避難してください" became `shelter`
 * (as did a neighbour's transcript of the same broadcast). Every category
 * still needs one of the words below.
 */
export const EMERGENCY_CATEGORIES = ["danger", "official_notice", "shelter"] as const satisfies readonly Category[];

/**
 * The words that make a card from the city's broadcast mail an emergency.
 * Matched on the card's Japanese title and body and the source excerpt,
 * after NFKC (full-width digits and spaces become ASCII) and with all
 * whitespace removed, so 警戒 レベル４ matches 警戒レベル4.
 *
 * Kept small on purpose. Every word here names an order to evacuate or a
 * hazard at the level where the city tells people to act now:
 * - 避難指示 (警戒レベル4) and 緊急安全確保 (警戒レベル5), the two current
 *   evacuation levels, and 避難命令, the word residents and older notices use;
 * - 警戒レベル4 or 5 written as the level;
 * - 津波警報, which includes 大津波警報. Not bare 津波: every earthquake report
 *   ends with この地震による津波の心配はありません. 津波注意報 is left out too;
 * - 特別警報, the weather agency's highest warning (大雨, 暴風, 大雪 and others);
 * - 震度5弱 or stronger (震度5弱, 5強, 6弱, 6強, 7).
 * Heat alerts, photochemical smog advisories, scam warnings and missing
 * person broadcasts, which the loudspeakers carry most weeks, match none.
 */
export const EMERGENCY_TERMS: readonly { term: string; pattern: RegExp }[] = [
  { term: "避難指示", pattern: /避難指示/ },
  { term: "避難命令", pattern: /避難命令/ },
  { term: "緊急安全確保", pattern: /緊急安全確保/ },
  { term: "警戒レベル4/5", pattern: /警戒レベル[45]/ },
  { term: "津波警報", pattern: /津波警報/ },
  { term: "特別警報", pattern: /特別警報/ },
  { term: "震度5弱+", pattern: /震度[5-7五六七]/ },
];

/**
 * A card whose Japanese title says the emergency is over (解除, lifted) or
 * that it is a drill (訓練) never switches the board on, whatever its body
 * mentions: "避難指示を解除しました" must not start disaster mode.
 */
const NOT_AN_EMERGENCY = /解除|訓練/;

function normalized(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "");
}

/** The fields of an extracted fact the rule reads. */
export interface EmergencyInput {
  category: Category;
  source_type: SourceType;
  title: { ja: string };
  body: { ja: string };
  original_excerpt?: string | null;
}

/** The emergency term the fact names, or null. Category and wording only; the source is checked by `switchesToDisaster`. */
export function emergencyTerm(fact: Pick<EmergencyInput, "category" | "title" | "body" | "original_excerpt">): string | null {
  if (!(EMERGENCY_CATEGORIES as readonly string[]).includes(fact.category)) return null;
  if (NOT_AN_EMERGENCY.test(normalized(fact.title.ja))) return null;
  const text = [fact.title.ja, fact.body.ja, fact.original_excerpt ?? ""].map(normalized).join("|");
  return EMERGENCY_TERMS.find((t) => t.pattern.test(text))?.term ?? null;
}

/**
 * Whether one written fact switches a peace board to disaster: it came from
 * the official inbox (`official` on platform `city_mail`, which only code
 * sets, see applyChannel), it went onto a public card as written content
 * (create, merge or update; a conflict leaves the card as it was, a held
 * card is nobody's yet), and it names an emergency. Returns the term for
 * the server log, or null. A firsthand or secondhand source never switches,
 * whatever it says.
 */
export function switchesToDisaster(
  fact: EmergencyInput,
  platform: Platform,
  applied: { action: ReconcileAction; visibility: Visibility },
): string | null {
  if (fact.source_type !== "official" || platform !== "city_mail") return null;
  if (applied.visibility !== "public") return null;
  if (applied.action !== "create" && applied.action !== "merge" && applied.action !== "update") return null;
  return emergencyTerm(fact);
}

// --- switching back: seven quiet days -------------------------------------------

/**
 * A disaster board returns to peace when its mode last changed more than
 * this many days ago and no public official card of an emergency category
 * (danger, official notice, shelter) was created in that many days. A manual switch within those days is
 * covered by the first half: it moved `mode_changed_at`.
 */
export const AUTO_RETURN_DAYS = 7;

export function autoReturnDue(view: Pick<ModeView, "mode" | "since">, now: Date): boolean {
  if (view.mode !== "disaster" || !view.since) return false;
  return now.getTime() - new Date(view.since).getTime() > AUTO_RETURN_DAYS * 86_400_000;
}

// --- the board in disaster mode -------------------------------------------------

/** Categories that come first in disaster mode, in this order; the rest follow. */
export const DISASTER_CATEGORY_ORDER = ["danger", "water", "shelter", "medical", "food", "supplies"] as const satisfies readonly Category[];

function categoryRank(category: Category): number {
  const i = (DISASTER_CATEGORY_ORDER as readonly string[]).indexOf(category);
  return i < 0 ? DISASTER_CATEGORY_ORDER.length : i;
}

/**
 * The list order in disaster mode: pinned first (as always), then official
 * sources, then by category (DISASTER_CATEGORY_ORDER, the rest after), then
 * newest first. Peace mode keeps the server's order (pinned, newest).
 */
export function disasterOrder<T extends Pick<Card, "pinned" | "source_type" | "category" | "created_at">>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const official = Number(b.source_type === "official") - Number(a.source_type === "official");
    if (official !== 0) return official;
    const rank = categoryRank(a.category) - categoryRank(b.category);
    if (rank !== 0) return rank;
    return b.created_at.localeCompare(a.created_at);
  });
}
