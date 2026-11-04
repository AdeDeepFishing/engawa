/**
 * Writes docs/brand/mark-04-variants.html: the two variants of mark 04 side
 * by side, for the pick between them. The paths come from
 * components/brand/Mark.tsx and the tiles from components/brand/icon-image.tsx,
 * so the page shows exactly what the switch would ship. The page is
 * self-contained (inline SVG, CSS and PNG data URLs, no request), so it opens
 * from the file system.
 *
 *   pnpm brand:preview
 */
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { BRAND, BRAND_JA, MARK_INSET, MARK_PATHS, MARK_UNITS, MARK_VIEWBOX, type MarkVariant } from "../../components/brand/Mark";
import { ICON_MARGIN, MarkImage, MarkTile } from "../../components/brand/icon-image";

const OUT = "docs/brand/mark-04-variants.html";
/** --accent-soft in app/globals.css, the top bar band. */
const BAR = "#fbe9f0";
const ZOOM = 6;

type Column = { variant: MarkVariant; name: string; ja: string; what: string; verdict: string };

const COLUMNS: Column[] = [
  {
    variant: "solid",
    name: "Solid",
    ja: "塗り",
    what: "The five mats as filled blocks; the 4 unit gaps between them are the edges (1 px at 16 px).",
    verdict:
      "My choice: it keeps the most colour at 16 to 32 px, so it holds in the tab, the top bar and the small tile, it matches the bold wordmark, and the gaps already are the 縁.",
  },
  {
    variant: "edges",
    name: "Edges",
    ja: "縁だけ",
    what: "Only the edges: each mat a rounded outline 4 units thick (1 px at 16 px), mats hollow, the five outlines 4 units apart.",
    verdict:
      "Second: closer to the word 畳縁 and lighter at 64 px and up, but at 16 to 20 px the outlines become a fine lattice with the half mat as a dot, so it is weaker exactly where the mark is seen most.",
  },
];

function inline(variant: MarkVariant, px: number, color: string): string {
  return `<svg viewBox="${MARK_VIEWBOX}" width="${px}" height="${px}" aria-hidden="true"><use href="#m-${variant}" fill="${color}"/></svg>`;
}

function figure(inner: string, caption: string): string {
  return `<figure>${inner}<figcaption>${caption}</figcaption></figure>`;
}

/** Side of the mark's grid in px on a tile, the same arithmetic as MarkTile. */
function tileBox(size: number, margin: number): number {
  return Math.round((size * (1 - 2 * margin) * MARK_UNITS) / (MARK_UNITS - 2 * MARK_INSET));
}

function tile(variant: MarkVariant, size: number, margin: number, radius: string): string {
  return `<div class="tile" style="width:${size}px;height:${size}px;border-radius:${radius}">${inline(variant, tileBox(size, margin), "#ffffff")}</div>`;
}

/** A PNG rendered by next/og (the renderer of the real icons), as a data URL. */
async function png(node: ReactElement, size: number): Promise<string> {
  const buf = Buffer.from(await new ImageResponse(node, { width: size, height: size }).arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function pixels(variant: MarkVariant, name: string): Promise<string> {
  const on = (bg: string, size: number, child: ReactElement) => (
    <div style={{ width: size, height: size, display: "flex", background: bg }}>{child}</div>
  );
  const shots: [string, number, string][] = [
    [await png(on(BRAND.paper, 16, <MarkImage color={BRAND.accent} box={16} variant={variant} />), 16), 16, "16 px, the tab"],
    [await png(on(BAR, 20, <MarkImage color={BRAND.accent} box={20} variant={variant} />), 20), 20, "20 px, the top bar"],
    [
      await png(
        on(BRAND.paper, 32, <MarkTile size={32} margin={ICON_MARGIN.favicon} radius={7} variant={variant} />),
        32,
      ),
      32,
      "32 px tile, /icon",
    ],
  ];
  return shots
    .map(([src, px, caption]) =>
      figure(
        `<img class="px" src="${src}" width="${px * ZOOM}" height="${px * ZOOM}" alt="${name} at ${px} px, enlarged ${ZOOM} times">`,
        caption,
      ),
    )
    .join("");
}

async function column(c: Column): Promise<string> {
  const v = c.variant;
  const sizes = (bg: string) =>
    `<div class="swatch" style="background:${bg}">${[16, 32, 64, 180].map((px) => figure(inline(v, px, BRAND.accent), String(px))).join("")}</div>`;
  return `<section class="col" aria-labelledby="h-${v}">
  <h2 id="h-${v}">${c.name} <span lang="ja" class="ja">${c.ja}</span> <code>"${v}"</code></h2>
  <p class="what">${c.what}</p>
  <div class="panel"><h3>On the paper ${BRAND.paper}</h3>${sizes(BRAND.paper)}</div>
  <div class="panel"><h3>On white</h3>${sizes("#ffffff")}</div>
  <div class="panel"><h3>As the pixels a 1x screen gets, enlarged ${ZOOM} times</h3><div class="row">${await pixels(v, c.name)}</div></div>
  <div class="panel"><h3>Top bar at 390 px, and the lockup of the preview image</h3>
    <div class="bar">${inline(v, 20, BRAND.accent)}<b>Engawa</b><span class="ctl">A+</span><span class="ctl">日本語</span></div>
    <div class="lockup">${inline(v, 56, BRAND.accent)}<span lang="ja">${BRAND_JA}</span>&nbsp;Engawa</div>
  </div>
  <div class="panel"><h3>App icon: iOS 180 (18 % margin), Android maskable 96 (22 %), favicon tile 32 (17 %)</h3><div class="row tiles">
    ${figure(tile(v, 180, ICON_MARGIN.apple, "40px"), "180, iOS rounds it")}
    ${figure(tile(v, 96, ICON_MARGIN.manifest, "50%"), "96, in the circle mask")}
    ${figure(tile(v, 32, ICON_MARGIN.favicon, "7px"), "32")}
  </div></div>
  <div class="panel"><h3>Favicon in a browser tab (app/icon.svg: the accent, the paper colour in dark mode)</h3>
    <div class="strip light"><span class="tab">${inline(v, 16, BRAND.accent)}<span>${BRAND_JA} Engawa</span></span></div>
    <div class="strip dark"><span class="tab">${inline(v, 16, BRAND.paper)}<span>${BRAND_JA} Engawa</span></span></div>
  </div>
  <p class="verdict">${c.verdict}</p>
</section>`;
}

async function main(): Promise<void> {
  const symbols = COLUMNS.map(
    (c) => `<symbol id="m-${c.variant}" viewBox="${MARK_VIEWBOX}"><path fill-rule="evenodd" d="${MARK_PATHS[c.variant]}"/></symbol>`,
  ).join("");
  const columns = (await Promise.all(COLUMNS.map(column))).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engawa mark 04, two variants</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BRAND.paper}; color: ${BRAND.ink}; line-height: 1.5;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  .intro { font-size: 16px; color: ${BRAND.muted}; max-width: 80ch; margin: 0 0 24px; }
  code { font-size: 14px; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 6px; padding: 0 6px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  h2 { font-size: 22px; margin: 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .ja { color: ${BRAND.muted}; font-weight: 600; font-size: 18px; }
  .what { margin: 0; font-size: 16px; }
  .panel { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 12px; }
  h3 { font-size: 13px; font-weight: 600; color: ${BRAND.muted}; margin: 0 0 8px; }
  .swatch, .row { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
  .swatch { padding: 16px; border-radius: 10px; border: 1px solid ${BRAND.line}; }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  figcaption { font-size: 12px; color: ${BRAND.muted}; font-variant-numeric: tabular-nums; }
  svg { display: block; }
  img.px { image-rendering: pixelated; border: 1px solid ${BRAND.line}; }
  .bar { display: flex; align-items: center; background: ${BAR}; border: 1px solid ${BRAND.line}; border-radius: 10px; padding: 0 16px; height: 60px; max-width: 390px; font-size: 16px; }
  .bar svg { margin-right: 6px; flex: none; }
  .bar .ctl { border: 1px solid #87837a; border-radius: 10px; padding: 0 10px; height: 36px; display: inline-flex; align-items: center; font-size: 14px; background: #fff; margin-left: 8px; }
  .bar .ctl:first-of-type { margin-left: auto; }
  .lockup { display: flex; align-items: center; gap: 14px; font-size: 37px; font-weight: 700; margin-top: 16px; }
  .tile { background: ${BRAND.accent}; display: flex; align-items: center; justify-content: center; }
  .strip { display: flex; padding: 8px 8px 0; border-radius: 8px; margin-top: 8px; }
  .strip.light { background: #dfe1e5; }
  .strip.dark { background: #202124; }
  .tab { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px 8px 0 0; font-size: 13px; width: 220px; }
  .light .tab { background: #fff; color: #1f1f1f; }
  .dark .tab { background: #35363a; color: #e8eaed; }
  .verdict { margin: 0; font-size: 16px; padding: 12px 14px; border-left: 4px solid ${BRAND.accent}; background: #fff; border-radius: 0 10px 10px 0; }
  @media (max-width: 860px) {
    .cols { grid-template-columns: 1fr; }
    .swatch { gap: 12px; padding: 12px; }
  }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${symbols}</defs></svg>
<main>
  <h1>Engawa mark 04, Tatami edges: two variants</h1>
  <p class="intro">Candidate 04 (四畳半の畳縁: four mats around a half mat) in the two variants the site can ship. Both are one path on the same 64 unit grid with the same footprint, 4 units from each side, so the pick changes nothing else on any page. The switch is one line: <code>MARK_VARIANT</code> in components/brand/Mark.tsx, "solid" or "edges", then <code>pnpm brand:icons</code> for app/icon.svg and app/favicon.ico. The build uses solid until then. Written by scripts/brand/variants-page.tsx from the same constants; the page makes no request.</p>
  <div class="cols">
${columns}
  </div>
</main>
</body>
</html>
`;
  writeFileSync(OUT, html);
  console.log(`wrote ${OUT} (${html.length} bytes)`);
}

main();
