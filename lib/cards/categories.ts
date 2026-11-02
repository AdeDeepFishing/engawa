import type { Category } from "@/lib/types";

/** Default validity in hours when the source states no end time (docs/PLAN.md section 4). */
export const DEFAULT_VALID_HOURS: Record<Category, number> = {
  water: 6,
  food: 6,
  supplies: 12,
  shelter: 12,
  medical: 12,
  power_comms: 12,
  shops: 3,
  transport: 3,
  danger: 24,
  official_notice: 72,
  daily_notice: 720,
  other: 12,
};

/** Decorative icon per category. Always rendered with aria-hidden next to the translated label. */
export const CATEGORY_ICON: Record<Category, string> = {
  water: "💧",
  food: "🍙",
  supplies: "📦",
  shelter: "🏫",
  medical: "🏥",
  power_comms: "🔌",
  shops: "🏪",
  transport: "🚃",
  danger: "⚠️",
  official_notice: "📢",
  daily_notice: "📋",
  other: "ℹ️",
};

/** Cards and the images behind them are purged this long after they stop being valid. */
export const CARD_RETENTION_DAYS = 30;

export function addHours(iso: string | Date, hours: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + hours * 3_600_000);
  return d.toISOString();
}

export function addDays(iso: string | Date, days: number): string {
  return addHours(iso, days * 24);
}

export function isExpired(validUntil: string | null, now = new Date()): boolean {
  return validUntil !== null && new Date(validUntil).getTime() < now.getTime();
}
