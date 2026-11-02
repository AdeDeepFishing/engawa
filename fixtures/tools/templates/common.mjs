// Shared helpers for the fixture templates: escaping, the inline PII markup,
// generated avatars and the phone status bar.

export const JA_FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
export const ZH_FONT = `"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif`;

// Phone screenshots are laid out at iPhone CSS size and captured at 3x,
// which gives the 1170 by 2532 output of a 6.1 inch iPhone.
export const PHONE = { width: 390, height: 844, scale: 3 };

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Message text may mark personal information inline as {kind:text}, for
// example "call {phone:090-1234-0213}". Each mark becomes a span with
// data-mask, which render.mjs measures for the masking ground truth.
export function richText(s) {
  return esc(s)
    .replace(/\{(name|phone|room|handle):([^}]+)\}/g, (_, kind, text) => maskSpan(kind, text))
    .replace(/\n/g, "<br>");
}

export function maskSpan(kind, text, label = text) {
  return `<span class="pii" data-mask="${kind}" data-mask-label="${esc(label)}">${esc(text)}</span>`;
}

// Small deterministic hash so the same name always gets the same avatar.
export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const AVATAR_COLOURS = ["#E8A87C", "#85C1A8", "#7FA7D9", "#C9A0DC", "#F2C14E", "#E57A7A", "#6CC4C9", "#A3B86C", "#D98FB0", "#8C9AC7"];

// A generated avatar: coloured background with either one initial or a
// simple shape. Never a photo. `owner` is the name the avatar belongs to.
export function avatar({ owner, size, radius = "50%", glyph = "initial", seed = owner }) {
  const h = hash(seed);
  const bg = AVATAR_COLOURS[h % AVATAR_COLOURS.length];
  const fg = "rgba(255,255,255,0.92)";
  let inner;
  if (glyph === "initial") {
    const initial = [...String(owner).replace(/^[@\s]+/, "")][0] ?? "?";
    inner = `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="46" font-weight="600" fill="${fg}" font-family='${JA_FONT}'>${esc(initial)}</text>`;
  } else if (glyph === "flower") {
    inner = [0, 72, 144, 216, 288]
      .map((a) => `<circle cx="${50 + 18 * Math.cos((a * Math.PI) / 180)}" cy="${50 + 18 * Math.sin((a * Math.PI) / 180)}" r="14" fill="${fg}"/>`)
      .join("") + `<circle cx="50" cy="50" r="10" fill="${bg}"/>`;
  } else if (glyph === "mountain") {
    inner = `<circle cx="70" cy="30" r="10" fill="${fg}"/><path d="M8 82 L38 40 L56 64 L68 50 L92 82 Z" fill="${fg}"/>`;
  } else if (glyph === "cat") {
    inner = `<path d="M26 34 L34 14 L46 30 L54 30 L66 14 L74 34 C82 44 82 70 50 78 C18 70 18 44 26 34 Z" fill="${fg}"/><circle cx="40" cy="48" r="4" fill="${bg}"/><circle cx="60" cy="48" r="4" fill="${bg}"/>`;
  } else if (glyph === "leaf") {
    inner = `<path d="M24 76 C24 40 44 22 78 22 C78 56 60 76 24 76 Z" fill="${fg}"/><path d="M24 76 L64 36" stroke="${bg}" stroke-width="4"/>`;
  } else {
    inner = `<circle cx="38" cy="42" r="16" fill="${fg}"/><rect x="50" y="48" width="30" height="30" rx="6" fill="${fg}" opacity="0.7"/>`;
  }
  const r = radius === "50%" ? 50 : radius;
  return `<span class="avatar" data-mask="avatar" data-mask-label="${esc(owner)}" style="display:inline-block;width:${size}px;height:${size}px;flex:none">
    <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block"><defs><clipPath id="c${h}"><rect width="100" height="100" rx="${r}"/></clipPath></defs><g clip-path="url(#c${h})"><rect width="100" height="100" fill="${bg}"/>${inner}</g></svg></span>`;
}

// iOS-like status bar: time on the left, signal, wifi and battery on the right.
export function statusBar({ time, colour = "#000", background = "transparent", battery = 0.62 }) {
  const bars = [4, 6.5, 9, 11.5]
    .map((h, i) => `<rect x="${i * 4.5}" y="${12 - h}" width="3" height="${h}" rx="0.8" fill="${colour}"/>`)
    .join("");
  return `<div style="height:47px;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0 44px;box-sizing:border-box;background:${background};color:${colour};font:600 16.5px/1 -apple-system,'SF Pro Text','Helvetica Neue',sans-serif;letter-spacing:-0.2px">
    <span>${esc(time)}</span>
    <span style="display:flex;gap:6px;align-items:center">
      <svg width="18" height="12" viewBox="0 0 18 12">${bars}</svg>
      <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.2 L5.6 8.6 A3.4 3.4 0 0 1 10.4 8.6 Z" fill="${colour}"/><path d="M3.2 6.3 A6.8 6.8 0 0 1 12.8 6.3" stroke="${colour}" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M0.9 3.9 A10 10 0 0 1 15.1 3.9" stroke="${colour}" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="${colour}" stroke-opacity="0.4" fill="none"/><rect x="2" y="2" width="${(20 * battery).toFixed(1)}" height="9" rx="2" fill="${colour}"/><path d="M25 4.5 C26.2 5 26.2 8 25 8.5" stroke="${colour}" stroke-opacity="0.4" stroke-width="1.4" fill="none"/></svg>
    </span>
  </div>`;
}

export function homeIndicator(colour = "#000") {
  return `<div style="height:34px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;box-sizing:border-box"><div style="width:134px;height:5px;border-radius:3px;background:${colour}"></div></div>`;
}

export function page({ lang, font, body, css = "" }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    body{width:${PHONE.width}px;height:${PHONE.height}px;overflow:hidden;font-family:${font};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .pii{white-space:nowrap}
    ${css}
  </style></head><body>${body}</body></html>`;
}
