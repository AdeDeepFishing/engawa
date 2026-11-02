// Contact sheet of every rendered fixture, for reviewing the look at a
// glance. Chat screenshots show their masking boxes as coloured outlines.

import { esc, JA_FONT } from "./common.mjs";

export const BOX_COLOURS = { avatar: "#E0218A", name: "#FF8A00", phone: "#E53935", room: "#1E6FE8", handle: "#13A05A" };

const TILE_W = 300;
const TILE_H = 440;

function tile(t) {
  const fit = Math.min(TILE_W / t.width, TILE_H / t.height);
  const w = Math.round(t.width * fit);
  const h = Math.round(t.height * fit);
  const boxes = (t.boxes ?? [])
    .map(
      (b) =>
        `<div style="position:absolute;left:${b.x * fit}px;top:${b.y * fit}px;width:${b.w * fit}px;height:${b.h * fit}px;outline:2px solid ${BOX_COLOURS[b.kind]};background:${BOX_COLOURS[b.kind]}22"></div>`,
    )
    .join("");
  return `<figure>
    <div class="frame"><div style="position:relative;width:${w}px;height:${h}px"><img src="${t.src}" style="width:${w}px;height:${h}px;display:block">${boxes}</div></div>
    <figcaption><b>${esc(t.label)}</b><span>${esc(t.sub)}</span></figcaption>
  </figure>`;
}

export function sheetHtml(sections) {
  const legend = Object.entries(BOX_COLOURS)
    .map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`)
    .join("");
  const body = sections
    .map((s) => `<section><h2>${esc(s.title)}</h2><div class="grid">${s.tiles.map(tile).join("")}</div></section>`)
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#F4F3F0}
    body{font-family:${JA_FONT};color:#1A1A1A;padding:28px 32px 36px;width:fit-content}
    h1{font-size:24px;margin:0 0 4px}
    .sub{font-size:14px;color:#555;margin-bottom:6px}
    .legend{display:flex;gap:16px;font-size:13px;color:#333;margin-bottom:10px}
    .legend i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:5px;vertical-align:-1px}
    h2{font-size:16px;margin:22px 0 10px;color:#333}
    .grid{display:grid;grid-template-columns:repeat(5, ${TILE_W}px);gap:18px}
    figure{margin:0;background:#fff;border-radius:8px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
    .frame{width:${TILE_W}px;height:${TILE_H}px;display:flex;align-items:center;justify-content:center;background:#EDECE8;border-radius:4px;overflow:hidden}
    figcaption{margin-top:8px;font-size:12.5px;line-height:1.4;display:flex;flex-direction:column}
    figcaption span{color:#666}
  </style></head><body>
    <h1>Engawa image fixtures</h1>
    <div class="sub">Hand-made test material rendered by fixtures/tools. Everyone in it is fictional. Outlines on the screenshots are the masking boxes.</div>
    <div class="legend">${legend}</div>
    ${body}
  </body></html>`;
}
