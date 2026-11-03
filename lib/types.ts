import type { CardLang, Lang } from "@/lib/i18n";

export type Multilingual = Record<CardLang, string>;

export const CATEGORIES = [
  "water",
  "food",
  "supplies",
  "shelter",
  "medical",
  "power_comms",
  "shops",
  "transport",
  "danger",
  "official_notice",
  "daily_notice",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SOURCE_TYPES = ["official", "firsthand", "secondhand", "unknown"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CARD_STATUSES = ["open", "closed", "full", "planned", "unknown"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const RISK_FLAGS = [
  "rumor",
  "scam",
  "sensitive_personal",
  "group_accusation",
  "prompt_injection",
] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];

export const PLATFORMS = [
  "line",
  "wechat",
  "x",
  "xiaohongshu",
  "facebook",
  "paper",
  "other",
  "unknown",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Platforms whose images are chat or social screenshots: originals are deleted and a masked copy may be kept. */
export const CHAT_PLATFORMS = ["line", "wechat", "x", "xiaohongshu", "facebook"] as const satisfies readonly Platform[];
export function isChatPlatform(p: Platform | null | undefined): boolean {
  return p != null && (CHAT_PLATFORMS as readonly string[]).includes(p);
}

export type Visibility = "public" | "held" | "hidden";
export type BoardMode = "peace" | "disaster";

export interface KnownPlace {
  id: string;
  kind: string;
  verified?: boolean;
  name_ja: string;
  address_ja?: string;
  notes_ja?: string;
  target_areas_ja?: string[];
  aliases: string[];
  names: Partial<Record<Exclude<Lang, "ja">, string>>;
  area_name_ja?: string;
}

export interface Board {
  id: string;
  slug: string;
  name: Record<Lang, string>;
  mode: BoardMode;
  area_names: { code: string | null; name_ja: string }[];
  known_places: KnownPlace[];
}

export interface CardFacts {
  status?: CardStatus;
  conditions?: string[];
  confidence?: "high" | "medium" | "low";
  platform?: Platform;
  /** False when valid_until is the category default rather than a time the source stated. */
  valid_until_stated?: boolean;
}

/**
 * One statement about a card, kept for display. `superseded`: an earlier
 * version that an update replaced ("previously: ..."). `conflict`: one side
 * of an open disagreement; the card content is left as it was.
 * Rows written before 2026-11-04 have only text, source_type, submission_id and at.
 */
export interface ConflictStatement {
  kind?: "superseded" | "conflict";
  /** Japanese body, plain text. */
  text: string;
  title?: Multilingual;
  body?: Multilingual;
  status?: CardStatus | null;
  valid_from?: string | null;
  valid_until?: string | null;
  source_type: SourceType;
  official_confirmed?: boolean;
  source_count?: number;
  submission_id: string | null;
  /** When this statement reached the board. */
  at: string;
  /** Superseded only: when the update replaced it. */
  replaced_at?: string;
}

export interface CardConflict {
  statements: ConflictStatement[];
}

/** One row of card_sources as shown to readers. No submission id leaves the server. */
export interface CardSource {
  relation: "created" | "confirmed" | "updated" | "conflict";
  source_type: SourceType;
  platform: Platform | null;
  created_at: string;
}

/**
 * One step in how a card was made: a card_sources row with the reconcile
 * decision's reason and the model that produced the row. `reason` is null on
 * a `created` row (nothing was compared) and on rows written before
 * 2026-11-04. `model` is the extract model on a `created` row and the
 * reconcile model on the others; null on rows written before 2026-11-04.
 */
export interface TraceStep extends CardSource {
  reason: string | null;
  model: string | null;
}

/** How a public card was made, as readers see it. Served by /api/cards/[id]/trace. */
export interface CardTrace {
  card_id: string;
  official_confirmed: boolean;
  /** Oldest first. */
  steps: TraceStep[];
  /**
   * Model ids as read from the rows, nothing else: `extract` from the
   * `created` row, `reconcile` from the latest confirmed, updated or conflict
   * row. Null when no such row exists or the row predates migration 0005;
   * the footer then names nothing rather than a configured default.
   */
  models: { extract: string | null; reconcile: string | null };
}

export interface Card {
  id: string;
  board_id: string;
  category: Category;
  place_id: string | null;
  place_text_ja: string | null;
  area_code: string | null;
  title: Multilingual;
  body: Multilingual;
  facts: CardFacts;
  original_text: string | null;
  original_lang: string | null;
  source_type: SourceType;
  official_confirmed: boolean;
  source_count: number;
  risk_flags: RiskFlag[];
  visibility: Visibility;
  /** Why the card is held: risk flags joined by commas, or "reconcile: <reason>". */
  held_reason?: string | null;
  last_confirmed_at?: string | null;
  conflict: CardConflict | null;
  valid_from: string | null;
  valid_until: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  /** Present when the query embeds card_sources, oldest first. */
  sources?: CardSource[];
  /**
   * Whether a masked copy of the chat screenshot (names and avatars painted
   * over) exists for this card. Shown through /api/cards/[id]/masked. The
   * Storage path itself (cards.masked_image_path) never leaves the server.
   */
  has_masked_image: boolean;
}

export type SubmissionStatus = "received" | "processing" | "done" | "held" | "failed";
export type Stage =
  | "stripping"
  | "extracting"
  | "masking"
  | "reconciling"
  | "translating"
  | "done"
  | "failed";

export const RECONCILE_ACTIONS = ["create", "merge", "update", "conflict", "hold"] as const;
export type ReconcileAction = (typeof RECONCILE_ACTIONS)[number];

export interface Submission {
  id: string;
  board_id: string;
  device_id: string;
  input_kind: "image" | "text";
  text_raw: string | null;
  image_path: string | null;
  image_deleted_at: string | null;
  detected_platform: Platform | null;
  uploader_area_code: string | null;
  status: SubmissionStatus;
  stage: Stage | null;
  held_reason: string | null;
  error: string | null;
  card_ids: string[];
  purge_after: string | null;
  created_at: string;
  processed_at: string | null;
}
