// Turns a clean notice PNG into something that looks like a phone photo of a
// printed sheet taped to a plain wall: slight rotation and keystone, soft
// shadow, paper texture, tape, uneven light, vignette and sensor grain.
// Everything is CSS and SVG noise with fixed seeds, so the output is stable.

export const PHOTO = { width: 1008, height: 1344, scale: 1.5 };

// Noise is drawn at the full size of the layer it covers, so it never tiles.
function noise({ seed, freq, octaves, alpha, colour = "0 0 0", w, h }) {
  const [r, g, b] = colour.split(" ");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${alpha} 0 0 0 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 0 0 / ${w}px ${h}px no-repeat`;
}

export function photoHtml(photo, pngBase64) {
  const { rotate, tiltX = 2, tiltY = -2, seed = 1, wall = "#DAD8D2", dx = 0, dy = 0, light = 135 } = photo;
  const paperW = 740;
  const paperH = Math.round((paperW * 1123) / 794);
  const left = Math.round((PHOTO.width - paperW) / 2 + dx);
  const top = Math.round((PHOTO.height - paperH) / 2 + dy);
  const full = { w: PHOTO.width, h: PHOTO.height };
  const sheet = { w: paperW, h: paperH };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    body{width:${PHOTO.width}px;height:${PHOTO.height}px;overflow:hidden;background:${wall}}
    .stage{position:absolute;inset:0;filter:blur(0.45px) contrast(0.96) saturate(0.92)}
    .wall{position:absolute;inset:0;background:
      ${noise({ seed: seed + 3, freq: 0.9, octaves: 1, alpha: 0.10, ...full })},
      ${noise({ seed: seed + 4, freq: 0.006, octaves: 3, alpha: 0.12, ...full })},
      linear-gradient(${light}deg, rgba(255,255,255,0.20), rgba(0,0,0,0.10));}
    .sheet{position:absolute;left:${left}px;top:${top}px;width:${paperW}px;height:${paperH}px;
      transform:perspective(1700px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotate(${rotate}deg);transform-origin:50% 45%}
    .paper{position:absolute;inset:0;background:#FDFCF9;
      box-shadow:0 2px 3px rgba(0,0,0,0.22), 6px 18px 34px rgba(0,0,0,0.22), 1px 1px 0 rgba(0,0,0,0.05)}
    .paper img{position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:multiply;opacity:0.94}
    .fibre{position:absolute;inset:0;background:
      ${noise({ seed, freq: 0.75, octaves: 2, alpha: 0.07, ...sheet })},
      ${noise({ seed: seed + 1, freq: 0.012, octaves: 3, alpha: 0.06, ...sheet })};mix-blend-mode:multiply}
    .shade{position:absolute;inset:0;background:
      linear-gradient(${light}deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.10) 100%),
      radial-gradient(120% 60% at 100% 100%, rgba(0,0,0,0.10), rgba(0,0,0,0) 60%)}
    .tape{position:absolute;width:150px;height:44px;background:rgba(236,229,206,0.72);
      box-shadow:0 1px 2px rgba(0,0,0,0.12);border-left:1px dashed rgba(0,0,0,0.05);border-right:1px dashed rgba(0,0,0,0.05)}
    .t1{left:-34px;top:-14px;transform:rotate(-34deg)}
    .t2{right:-34px;top:-14px;transform:rotate(31deg)}
    .t3{left:50%;bottom:-20px;margin-left:-75px;transform:rotate(-2deg);opacity:0.9}
    .vignette{position:absolute;inset:0;background:radial-gradient(ellipse 75% 70% at 48% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.30) 100%)}
    .grain{position:absolute;inset:0;background:${noise({ seed: seed + 7, freq: 1.4, octaves: 1, alpha: 0.10, ...full })},
      ${noise({ seed: seed + 8, freq: 1.2, octaves: 1, alpha: 0.06, colour: "1 1 1", ...full })}}
  </style></head><body><div class="stage">
    <div class="wall"></div>
    <div class="sheet">
      <div class="paper"><img src="data:image/png;base64,${pngBase64}"><div class="fibre"></div><div class="shade"></div></div>
      <div class="tape t1"></div><div class="tape t2"></div><div class="tape t3"></div>
    </div>
    <div class="vignette"></div>
    <div class="grain"></div>
  </div></body></html>`;
}
