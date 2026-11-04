import { ImageResponse } from "next/og";
import { BRAND, markDataUrl } from "./Mark";

/**
 * A square PNG of the mark in the paper colour on the accent, for the app
 * icons (app/icon.tsx, app/apple-icon.tsx, app/icons/[size]). `mark` is the
 * side of the mark's 32 unit box as a share of the icon; at 0.6 the mark
 * stays inside the circle a maskable icon keeps (80 % of the side), so one
 * image serves as "any" and "maskable". `radius` rounds the tile for a
 * browser tab; icons a platform masks itself stay square.
 */
export function iconResponse(size: number, { mark = 0.6, radius = 0 }: { mark?: number; radius?: number } = {}) {
  const side = Math.round(size * mark);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.accent,
          borderRadius: radius,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders <img>, not next/image */}
        <img src={markDataUrl(BRAND.paper)} width={side} height={side} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
