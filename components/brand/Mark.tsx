/**
 * The Engawa mark: the eave of a veranda over a speech bubble that holds two
 * lines of a notice, the place where neighbours talk and the notice they
 * talk about. One path on a 32 unit grid, drawn with the even-odd rule (the
 * two lines are holes), so it is one colour on any background. Every edge
 * sits on an even unit, which keeps it sharp at 16 px. The sketches it was
 * chosen over are in docs/DEVLOG.md (2026-11-04, home page and brand mark).
 *
 * Used by the top bar, the home page, the favicon (app/icon.svg holds the
 * same path), the PNG icons and the link preview images.
 */
export const MARK_PATH =
  "M8 2h16l6 6H2z" + // eave
  "M7 10h18a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H14l-6 6v-6H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" + // bubble
  "M8 14v2h16v-2z" + // first line
  "M8 18v2h10v-2z"; // second line

export const MARK_VIEWBOX = "0 0 32 32";

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

/** The mark as a standalone SVG document, for next/og images (as a data URL). */
export function markSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><path fill="${color}" fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
}

export function markDataUrl(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(markSvg(color))}`;
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
