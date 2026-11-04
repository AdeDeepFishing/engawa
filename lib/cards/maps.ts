import { boardMunicipality } from "@/lib/geo";
import type { Board, Card } from "@/lib/types";
import { knownPlaceOf } from "./display";

/**
 * Google Maps search URLs (N17). A plain search link, no API key: a phone
 * opens it in the Maps app, a laptop in a new tab. Nothing is fetched and no
 * position is read before the reader taps it, and the link carries only the
 * place's public name and address, never a coordinate.
 */
const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query=";

/** Place texts that only make sense from where the writer stood. */
const RELATIVE_PLACE = /^(当|この|その|本|弊|同|うち|私の)/;

type MapsBoard = Pick<Board, "known_places" | "area_names" | "name">;

/**
 * What to search for. A known place: its Japanese name, then its address
 * with the board's city and ward in front ("川崎市立小杉小学校
 * 川崎市中原区小杉町2-295-1"), or the city and ward alone when the place has
 * no address. A card with only a place text: that text and the board's
 * area. Null when the card names no place.
 */
export function mapsQuery(card: Pick<Card, "place_id" | "place_text_ja">, board: MapsBoard): string | null {
  const city = boardMunicipality(board);
  // Without a known city the board's own name (武蔵小杉) still narrows the search.
  const area = city ?? board.name.ja;
  const place = knownPlaceOf(card, board);
  if (place) {
    const address = place.address_ja?.trim();
    if (!address) return `${place.name_ja} ${area}`;
    if (!city) return `${place.name_ja} ${address} ${area}`;
    // An address that already names a city, ward or prefecture is searched as it is.
    return `${place.name_ja} ${/[都道府県市区]/.test(address) ? address : `${city}${address}`}`;
  }
  const text = card.place_text_ja?.trim();
  if (!text) return null;
  // A spot named only relative to the writer (当マンション, この建物, 本施設)
  // would send the reader to an arbitrary point in the ward: no link.
  if (RELATIVE_PLACE.test(text)) return null;
  return text.includes(area) ? text : `${text} ${area}`;
}

/** The search URL for the card's place, or null when it names none. */
export function mapsUrl(card: Pick<Card, "place_id" | "place_text_ja">, board: MapsBoard): string | null {
  const query = mapsQuery(card, board);
  return query ? `${MAPS_SEARCH}${encodeURIComponent(query)}` : null;
}
