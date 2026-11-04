/**
 * The Engawa mark: a four-and-a-half mat room (四畳半) drawn by its tatami,
 * four mats turning around a half mat. The gaps between the mats are the
 * mat edges, 畳縁, the same 縁 as in 縁側: the smallest room where people sit
 * down together. Candidate 04 of docs/brand/candidates.html; the two
 * variants side by side are in docs/brand/mark-04-variants.html.
 *
 * Used by the top bar, the favicon (app/icon.svg and app/favicon.ico are
 * written from here by `pnpm brand:icons`), the PNG icons and the link
 * preview images (both through components/brand/icon-image.tsx).
 */

export type MarkVariant = "solid" | "edges";

/**
 * The one switch for the mark everywhere: `solid` (the mats as filled
 * blocks, the edges as gaps) or `edges` (only the edges, each mat an
 * outline). After changing it, run `pnpm brand:icons` for the static files.
 */
export const MARK_VARIANT: MarkVariant = "solid";

/** Side of the mark's square grid, in units. */
export const MARK_UNITS = 64;

/** Empty units between the drawn mark and each side of the grid, the same in both variants. */
export const MARK_INSET = 4;

export const MARK_VIEWBOX = `0 0 ${MARK_UNITS} ${MARK_UNITS}`;

/**
 * The five mats as [x, y, width, height] on the 64 unit grid. Every mat is
 * 16 units wide and every gap 4, so at 16 px a mat is 4 px and a gap 1 px,
 * on whole pixels. A full mat is two half mats plus one gap long (36): with
 * half a gap around each, a full mat is 40 by 20 and the half mat 20 by 20,
 * 2:1 and truly half, as with real tatami, whose edges belong to the mat.
 * A quarter turn about the centre maps the room onto itself, so it is
 * centred optically as well as geometrically, 4 units from every side.
 */
const MATS = [
  [4, 4, 36, 16], // top
  [44, 4, 16, 36], // right
  [24, 44, 36, 16], // bottom
  [4, 24, 16, 36], // left
  [24, 24, 16, 16], // the half mat
] as const;

/** Stroke of the `edges` variant: 4 units is exactly 1 px at 16 px and 2 px at 32 px. */
const EDGE = 4;
/** Outer corner radius of each outline in `edges`; the inner one is this minus EDGE. */
const EDGE_RADIUS = 5;

function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  const arc = (dx: number, dy: number) => `a${r} ${r} 0 0 1 ${dx} ${dy}`;
  return `M${x + r} ${y}h${w - 2 * r}${arc(r, r)}v${h - 2 * r}${arc(-r, r)}h${2 * r - w}${arc(-r, -r)}v${2 * r - h}${arc(r, -r)}Z`;
}

/**
 * Both variants as one path each, drawn with the even-odd rule so the mark
 * is one colour on any background. In `edges` each mat is a rounded outline
 * (its hole is the inner rectangle) and the five outlines keep the same
 * 4 unit gap as the blocks of `solid`.
 */
export const MARK_PATHS: Record<MarkVariant, string> = {
  solid: MATS.map(([x, y, w, h]) => rect(x, y, w, h)).join(""),
  edges: MATS.map(
    ([x, y, w, h]) =>
      rect(x, y, w, h, EDGE_RADIUS) + rect(x + EDGE, y + EDGE, w - 2 * EDGE, h - 2 * EDGE, EDGE_RADIUS - EDGE),
  ).join(""),
};

export const MARK_PATH = MARK_PATHS[MARK_VARIANT];

/** The name in Japanese, shown before the wordmark on the home page and in the preview images. */
export const BRAND_JA = "縁側";

/** Colours of the brand files, the same values as the tokens in app/globals.css. */
export const BRAND = {
  accent: "#ad235d",
  paper: "#fbfaf7",
  ink: "#1b1b1b",
  muted: "#5c5c5c",
  line: "#d9d6cf",
} as const;

/** The mark as a standalone SVG document, for next/og images (as a data URL) and the brand scripts. */
export function markSvg(color: string, variant: MarkVariant = MARK_VARIANT): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><path fill="${color}" fill-rule="evenodd" d="${MARK_PATHS[variant]}"/></svg>`;
}

export function markDataUrl(color: string, variant: MarkVariant = MARK_VARIANT): string {
  return `data:image/svg+xml,${encodeURIComponent(markSvg(color, variant))}`;
}

/**
 * The mark inline, in the current text colour. Decorative by default: next
 * to the wordmark it repeats the name, so screen readers skip it.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}
