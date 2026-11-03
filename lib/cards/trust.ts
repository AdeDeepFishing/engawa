import type { SourceType } from "@/lib/types";

/**
 * Trust order from the plan: confirmed official, official, firsthand,
 * secondhand, unknown. Higher wins; with equal trust, newer wins.
 */
export function trustRank(sourceType: SourceType, officialConfirmed = false): number {
  if (officialConfirmed) return 4;
  return { official: 3, firsthand: 2, secondhand: 1, unknown: 0 }[sourceType];
}
