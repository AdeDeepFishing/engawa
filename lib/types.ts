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
}

export interface ConflictStatement {
  text: string;
  source_type: SourceType;
  submission_id: string | null;
  at: string;
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
  conflict: { statements: ConflictStatement[] } | null;
  valid_from: string | null;
  valid_until: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type SubmissionStatus = "received" | "processing" | "done" | "held" | "failed";
export type Stage =
  | "stripping"
  | "extracting"
  | "reconciling"
  | "translating"
  | "done"
  | "failed";

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
