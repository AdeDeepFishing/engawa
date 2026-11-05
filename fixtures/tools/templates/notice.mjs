// Paper notices on an A4 page (794 by 1123 CSS px, captured at 2x).
// Two styles: "formal" for a building management company (記 ... 以上) and
// "shelter" for a hand-made shelter notice. No crest, logo or phone number.
// Every fixture page carries the 訓練用・想定シナリオ stamp in the bottom left
// corner; a spec with `stamp: false` (the demo inputs in demo-specs.mjs) has none.
// The footer row sits after the content; render.mjs fails if a page overflows.

import { esc, JA_FONT } from "./common.mjs";

export const A4 = { width: 794, height: 1123, scale: 2 };

function foot(lines, stamp = true) {
  const mark = stamp ? `<div class="stamp"><span>訓練用・想定シナリオ</span></div>` : "<div></div>";
  return `<div class="foot">${mark}
    <div class="footer">${lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div></div>`;
}

// Big titles shrink to stay on one line.
function titleSize(title, max, width) {
  return Math.min(max, Math.floor(width / ([...title].length * 1.12)));
}

function rowsTable(rows) {
  return `<table class="rows">${rows
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("")}</table>`;
}

function bullets(list) {
  return `<ul class="bullets">${list.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
}

function formal(spec) {
  return `<div class="sheet formal">
    <div class="date">${esc(spec.date)}</div>
    <div class="to">${esc(spec.to)}</div>
    <h1>${esc(spec.title)}</h1>
    <p class="intro">${esc(spec.intro).replace(/\n/g, "<br>")}</p>
    <div class="ki">記</div>
    ${rowsTable(spec.rows)}
    <h2>${esc(spec.bulletsHeading)}</h2>
    ${bullets(spec.bullets)}
    <div class="ijo">以上</div>
    ${foot(spec.footer, spec.stamp !== false)}
  </div>`;
}

function shelter(spec) {
  const label = spec.label ? `<div class="label">${esc(spec.label)}</div>` : "";
  const lead = spec.lead ? `<div class="lead">${esc(spec.lead).replace(/\n/g, "<br>")}</div>` : "";
  const items = spec.items
    ? `<div class="items"><div class="items-h">${esc(spec.itemsHeading)}</div>${spec.items.map((i) => `<div class="item"><span class="box"></span>${esc(i)}</div>`).join("")}</div>`
    : "";
  const numbered = spec.numbered
    ? `<ol class="numbered">${spec.numbered.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>`
    : "";
  return `<div class="sheet shelter">
    <div class="band">${esc(spec.band)}</div>
    ${label}
    <h1 style="font-size:${titleSize(spec.title, 76, 650)}px">${esc(spec.title)}</h1>
    ${lead}
    ${spec.rows ? rowsTable(spec.rows) : ""}
    ${items}
    ${numbered}
    ${spec.bullets ? bullets(spec.bullets) : ""}
    ${foot(spec.footer, spec.stamp !== false)}
  </div>`;
}

export function noticeHtml(spec) {
  const body = spec.style === "formal" ? formal(spec) : shelter(spec);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    body{width:${A4.width}px;height:${A4.height}px;overflow:hidden;font-family:${JA_FONT};color:#111;-webkit-font-smoothing:antialiased}
    .sheet{position:relative;box-sizing:border-box;width:100%;height:100%;padding:64px 70px 54px;display:flex;flex-direction:column}
    .foot{margin-top:auto;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end}
    .stamp{margin:0 0 -4px -14px;transform:rotate(-7deg);border:3px solid #C8323C;border-radius:8px;padding:6px 12px;color:#C8323C;font-weight:700;font-size:17px;letter-spacing:0.08em;opacity:0.88}
    .stamp span{display:block;border:1px solid rgba(200,50,60,0.7);border-radius:4px;padding:4px 10px}

    .formal .date{text-align:right;font-size:19px}
    .formal .to{font-size:21px;margin-top:14px}
    .formal h1{text-align:center;font-size:44px;font-weight:700;letter-spacing:0.22em;margin:30px auto 22px;padding-bottom:10px;border-bottom:4px double #111;width:fit-content}
    .formal .intro{font-size:19px;line-height:1.95;margin:0 0 24px}
    .formal .ki{text-align:center;font-size:22px;margin:8px 0 18px}
    .formal .rows{width:100%;border-collapse:collapse;font-size:21px}
    .formal .rows th,.formal .rows td{border:1.5px solid #222;padding:14px 18px;text-align:left;vertical-align:top;line-height:1.5}
    .formal .rows th{width:150px;background:#F1F1EE;font-weight:600;letter-spacing:0.15em}
    .formal .rows td{font-weight:600}
    .formal h2{font-size:21px;margin:30px 0 8px;font-weight:700}
    .formal .bullets{font-size:18.5px;line-height:1.8;margin:0;padding-left:1.2em}
    .formal .ijo{text-align:right;font-size:20px;margin-top:18px}
    .formal .footer{text-align:right;font-size:19px;line-height:1.7}

    .shelter{padding-top:56px}
    .shelter .band{border:3px solid #111;padding:12px 18px;font-size:25px;font-weight:700;text-align:center;letter-spacing:0.06em}
    .shelter .label{margin:30px auto 0;width:fit-content;background:#C8323C;color:#fff;font-size:30px;font-weight:800;padding:6px 26px;letter-spacing:0.2em}
    .shelter h1{text-align:center;font-weight:800;letter-spacing:0.1em;margin:30px 0 30px;white-space:nowrap}
    .shelter .label + h1{margin-top:16px}
    .shelter .lead{border:2.5px solid #C8323C;color:#111;padding:16px 20px;font-size:24px;line-height:1.6;font-weight:600;margin-bottom:28px}
    .shelter .rows{width:100%;border-collapse:collapse;margin-bottom:28px}
    .shelter .rows th,.shelter .rows td{border:2.5px solid #111;padding:16px 20px;text-align:left}
    .shelter .rows th{width:120px;background:#111;color:#fff;font-size:30px;font-weight:700;letter-spacing:0.2em;text-align:center}
    .shelter .rows td{font-size:40px;font-weight:800;letter-spacing:0.02em}
    .shelter .bullets{font-size:26px;line-height:1.65;margin:0;padding-left:0;list-style:none}
    .shelter .bullets li{padding-left:1.1em;text-indent:-1.1em;margin-bottom:10px;font-weight:500}
    .shelter .bullets li::before{content:"・";font-weight:800}
    .shelter .items{border:2.5px dashed #111;padding:14px 22px 10px;margin-bottom:24px}
    .shelter .items-h{font-size:22px;font-weight:700;margin-bottom:6px}
    .shelter .item{font-size:30px;font-weight:800;line-height:1.7;display:flex;align-items:center}
    .shelter .item .box{display:inline-block;width:22px;height:22px;border:3px solid #111;margin-right:16px;flex:none}
    .shelter .numbered{font-size:25.5px;line-height:1.6;margin:0;padding-left:1.6em}
    .shelter .numbered li{margin-bottom:16px;font-weight:500;padding-left:0.2em}
    .shelter .numbered li::marker{font-weight:800}
    .shelter .footer{text-align:right;font-size:22px;line-height:1.7;font-weight:600}
  </style></head><body>${body}</body></html>`;
}
