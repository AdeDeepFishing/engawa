import type { MessageKey } from "@/lib/i18n";
import type { Board, Card, KnownPlace } from "@/lib/types";
import { CATEGORY_ICON, isExpired } from "./categories";
import { contentTime, knownPlaceOf } from "./display";

/**
 * The board's cards grouped by place (N10). Grouped on the client from the
 * cards already loaded, so the 5 second poll keeps the groups current and
 * the view costs no request.
 */
export interface PlaceGroup {
  /** `place:<id>` for a known place, `other` for the last group. */
  key: string;
  /** Null for the last group: cards whose place is not one of the board's known places, or that name none. */
  place: KnownPlace | null;
  /** Known places: in the board's order (pinned, then newest). The last group: by place text, cards without one at the end. */
  cards: Card[];
  /** When the group's newest content reached the board (the last update, else creation). */
  newestAt: string;
  /**
   * Shelters only: the newest card of category shelter at this place, or
   * null when the place has cards but none says how the shelter is.
   * Undefined for every other kind of place.
   */
  shelterCard?: Card | null;
}

export const OTHER_PLACES_KEY = "other";

/** How the board lists its cards: newest first, or grouped by place. `?view=places` in the URL. */
export type BoardViewMode = "list" | "places";

export function parseBoardView(value: unknown): BoardViewMode | null {
  return value === "list" || value === "places" ? value : null;
}

const KIND_KEYS: Record<string, MessageKey> = {
  shelter: "places.kind.shelter",
  water_point: "places.kind.water_point",
  station: "places.kind.station",
  park: "places.kind.park",
  commuter_shelter: "places.kind.commuter_shelter",
  office: "places.kind.office",
};

const KIND_ICONS: Record<string, string> = {
  shelter: CATEGORY_ICON.shelter,
  water_point: CATEGORY_ICON.water,
  station: CATEGORY_ICON.transport,
  park: "🌳",
  commuter_shelter: "🏢",
  office: "🏛️",
};

/** The label key for a known place's kind; a kind the board invents later reads "Place". */
export function placeKindKey(kind: string): MessageKey {
  return KIND_KEYS[kind] ?? "places.kind.other";
}

/** The icon beside a group's name. */
export function placeKindIcon(kind: string | null): string {
  return (kind && KIND_ICONS[kind]) || "📍";
}

const time = (card: Card) => new Date(contentTime(card)).getTime();

function newest(cards: Card[]): Card | null {
  let best: Card | null = null;
  for (const card of cards) if (!best || time(card) > time(best)) best = card;
  return best;
}

/**
 * One group per known place that has at least one card, the place with the
 * newest content first, then one last group for every other card. Cards keep
 * the board's order inside a known place; the last group sorts them by their
 * place text so the same spot sits together.
 */
export function groupByPlace(cards: Card[], board: Pick<Board, "known_places">, now = new Date()): PlaceGroup[] {
  const byPlace = new Map<string, { place: KnownPlace; cards: Card[] }>();
  const other: Card[] = [];
  for (const card of cards) {
    const place = knownPlaceOf(card, board);
    if (!place) {
      other.push(card);
      continue;
    }
    const group = byPlace.get(place.id);
    if (group) group.cards.push(card);
    else byPlace.set(place.id, { place, cards: [card] });
  }

  const groups: PlaceGroup[] = [...byPlace.values()].map(({ place, cards: list }) => ({
    key: `place:${place.id}`,
    place,
    cards: list,
    newestAt: contentTime(newestLive(list, now)),
    ...(place.kind === "shelter" ? { shelterCard: newest(list.filter((c) => c.category === "shelter")) } : {}),
  }));
  groups.sort((a, b) => new Date(b.newestAt).getTime() - new Date(a.newestAt).getTime());

  if (other.length) {
    const sorted = [...other].sort((a, b) => {
      const x = a.place_text_ja?.trim() || null;
      const y = b.place_text_ja?.trim() || null;
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x.localeCompare(y, "ja");
    });
    groups.push({ key: OTHER_PLACES_KEY, place: null, cards: sorted, newestAt: contentTime(newestLive(sorted, now)) });
  }
  return groups;
}

/**
 * The card that orders a group: the newest card still in force, so an
 * expired notice cannot lift a stale place to the top; the newest card of
 * all when every card in the group has expired.
 */
function newestLive(list: Card[], now: Date): Card {
  const live = list.filter((c) => !isExpired(c.valid_until, now));
  return newest(live.length ? live : list)!;
}
