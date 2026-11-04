import { ImageResponse } from "next/og";
import { BRAND, MARK_INSET, MARK_UNITS, markDataUrl, type MarkVariant } from "./Mark";

/**
 * The mark for every next/og image: the app icons (app/icon.tsx,
 * app/apple-icon.tsx, app/icons/[size]) and the link preview images
 * (app/opengraph-image.tsx, app/b/[slug]/opengraph-image.tsx). The variant
 * comes from MARK_VARIANT in ./Mark, so none of them keeps its own copy;
 * `variant` is only passed by the brand preview (scripts/brand).
 */

/** The mark as an <img> for next/og; `box` is the side of its 64 unit grid in px (the drawn mark is 56/64 of it). */
export function MarkImage({ color, box, variant }: { color: string; box: number; variant?: MarkVariant }) {
  // eslint-disable-next-line @next/next/no-img-element -- next/og renders <img>, not next/image
  return <img src={markDataUrl(color, variant)} width={box} height={box} alt="" />;
}

/**
 * The mark in white on an accent tile `size` px square. `margin` is the
 * share of the side left empty between the drawn mark and each edge of the
 * tile; `radius` rounds the tile where nothing masks it.
 */
export function MarkTile({
  size,
  margin,
  radius = 0,
  variant,
}: {
  size: number;
  margin: number;
  radius?: number;
  variant?: MarkVariant;
}) {
  const drawn = size * (1 - 2 * margin);
  const box = Math.round((drawn * MARK_UNITS) / (MARK_UNITS - 2 * MARK_INSET));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.accent,
        borderRadius: radius,
      }}
    >
      <MarkImage color="#ffffff" box={box} variant={variant} />
    </div>
  );
}

/** A square PNG of the mark on the accent tile, for the app icons. */
export function iconResponse(size: number, { margin, radius = 0 }: { margin: number; radius?: number }) {
  return new ImageResponse(<MarkTile size={size} margin={margin} radius={radius} />, { width: size, height: size });
}

/**
 * Margins of the icons. The manifest icons serve as "any" and "maskable":
 * Android keeps a circle of 80 % of the side, and the mark is square with
 * filled corners, so it may span at most 80 % / sqrt(2), about 56.6 %, which
 * leaves 22 % on each side. iOS rounds the apple icon's corners itself, so
 * 18 % is enough there. The 32 px favicon tile is rounded (radius 7) and
 * keeps 17 %, the mark's grid at 24 px as before.
 */
export const ICON_MARGIN = { manifest: 0.22, apple: 0.18, favicon: 0.17 } as const;
