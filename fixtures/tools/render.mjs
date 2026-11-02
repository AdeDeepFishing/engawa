// Renders the image fixtures from specs.mjs with Playwright and Chromium.
//
//   pnpm --dir fixtures/tools install --ignore-workspace   (once)
//   pnpm --dir fixtures/tools render                       all fixtures
//   pnpm --dir fixtures/tools render p02 p04               only these ids
//
// Writes, relative to fixtures/:
//   inputs/<file>.png    clean notice (A4 at 2x) or phone screenshot (1170 by 2532)
//   inputs/<file>.jpg    photo-like variant of each notice (1512 by 2016)
//   masking/<id>.json    pixel boxes of every name, avatar, phone number,
//                        room number and handle in a screenshot
//   tools/out/contact-sheet.png   every output on one page (not committed)
//
// Fonts come from the system (Hiragino Sans, PingFang SC on macOS), so pixel
// output is stable on one machine but can shift on another. The masking boxes
// are measured from the same render, so they always match the image they sit
// next to. Re-render both together.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { chats, notices } from "./specs.mjs";
import { chatHtml } from "./templates/chat.mjs";
import { PHONE } from "./templates/common.mjs";
import { A4, noticeHtml } from "./templates/notice.mjs";
import { PHOTO, photoHtml } from "./templates/photo.mjs";
import { sheetHtml } from "./templates/sheet.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..");
const dirs = {
  inputs: join(fixtures, "inputs"),
  masking: join(fixtures, "masking"),
  expected: join(fixtures, "expected"),
  out: join(here, "out"),
};

const only = process.argv.slice(2);
const pick = (list) => (only.length ? list.filter((s) => only.includes(s.id)) : list);

async function shoot(browser, { html, viewport, scale, type = "png", quality }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ type, quality, animations: "disabled" });
  return { page, buf };
}

async function renderNotice(browser, spec) {
  const clean = await shoot(browser, { html: noticeHtml(spec), viewport: A4, scale: A4.scale });
  const overflow = await clean.page.evaluate(() => document.querySelector(".sheet").scrollHeight - innerHeight);
  await clean.page.close();
  if (overflow > 0) throw new Error(`${spec.id}: notice content overflows the page by ${overflow}px, shorten it`);
  await writeFile(join(dirs.inputs, `${spec.file}.png`), clean.buf);

  const photo = await shoot(browser, {
    html: photoHtml(spec.photo, clean.buf.toString("base64")),
    viewport: { width: PHOTO.width, height: PHOTO.height },
    scale: PHOTO.scale,
    type: "jpeg",
    quality: 84,
  });
  await photo.page.close();
  await writeFile(join(dirs.inputs, `${spec.file}.jpg`), photo.buf);
  console.log(`${spec.id}  ${spec.file}.png  ${spec.file}.jpg`);
}

// Reads every [data-mask] element as rendered, clipped to its scrolling
// region, in CSS pixels.
function measureMasks() {
  const out = [];
  for (const el of document.querySelectorAll("[data-mask]")) {
    const clipEl = el.closest("[data-clip]");
    const clip = clipEl ? clipEl.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const rects = el.classList.contains("avatar") ? [el.getBoundingClientRect()] : [...el.getClientRects()];
    for (const r of rects) {
      const left = Math.max(r.left, clip.left, 0);
      const top = Math.max(r.top, clip.top, 0);
      const right = Math.min(r.right, clip.right, innerWidth);
      const bottom = Math.min(r.bottom, clip.bottom, innerHeight);
      if (right - left < 1 || bottom - top < 1) continue;
      out.push({ kind: el.dataset.mask, label: el.dataset.maskLabel, left, top, right, bottom });
    }
  }
  return out;
}

async function renderChat(browser, spec) {
  const { page, buf } = await shoot(browser, {
    html: chatHtml(spec),
    viewport: { width: PHONE.width, height: PHONE.height },
    scale: PHONE.scale,
  });
  const raw = await page.evaluate(measureMasks);
  await page.close();

  const s = PHONE.scale;
  const width = PHONE.width * s;
  const height = PHONE.height * s;
  const boxes = raw
    .map((r) => {
      const x = Math.max(0, Math.floor(r.left * s));
      const y = Math.max(0, Math.floor(r.top * s));
      const x2 = Math.min(width, Math.ceil(r.right * s));
      const y2 = Math.min(height, Math.ceil(r.bottom * s));
      return { kind: r.kind, label: r.label, x, y, w: x2 - x, h: y2 - y };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const file = `${spec.file}.png`;
  await writeFile(join(dirs.inputs, file), buf);
  const masking = {
    _note:
      "Ground truth for the screenshot masking eval. Boxes are in pixels of the input image (x, y from the top left, w, h), measured from the DOM at render time and rounded outward. kind is avatar, name, phone, room or handle; label is the visible text, or for an avatar the name of its owner. Everything here is fictional.",
    input: file,
    width,
    height,
    boxes,
  };
  await writeFile(join(dirs.masking, `${spec.id}.json`), JSON.stringify(masking, null, 2) + "\n");
  console.log(`${spec.id}  ${file}  ${boxes.length} masking boxes`);
  await checkAgainstExpected(spec.id, boxes);
  return { spec, file, width, height, boxes };
}

// Every name, phone number, room number and handle that has a masking box
// must also be listed in expected/<id>.json must_not_contain.
async function checkAgainstExpected(id, boxes) {
  const path = join(dirs.expected, `${id}.json`);
  if (!existsSync(path)) {
    console.warn(`  warning: ${path} does not exist yet`);
    return;
  }
  const expected = JSON.parse(await readFile(path, "utf8"));
  const banned = new Set(expected.must_not_contain ?? []);
  const missing = [...new Set(boxes.filter((b) => b.kind !== "avatar").map((b) => b.label))].filter((l) => !banned.has(l));
  if (missing.length) console.warn(`  warning: ${id} must_not_contain lacks ${missing.join(", ")}`);
}

async function renderSheet(browser) {
  const dataUrl = async (file) => {
    const buf = await readFile(join(dirs.inputs, file));
    return `data:image/${file.endsWith(".jpg") ? "jpeg" : "png"};base64,${buf.toString("base64")}`;
  };
  const sections = [
    { title: "Paper notices, clean PNG", tiles: [] },
    { title: "Paper notices, photo-like JPEG", tiles: [] },
    { title: "Chat and post screenshots, with masking boxes", tiles: [] },
  ];
  for (const n of notices) {
    sections[0].tiles.push({ label: `${n.file}.png`, sub: `${A4.width * A4.scale} × ${A4.height * A4.scale}`, src: await dataUrl(`${n.file}.png`), width: A4.width, height: A4.height });
    sections[1].tiles.push({ label: `${n.file}.jpg`, sub: `${PHOTO.width * PHOTO.scale} × ${PHOTO.height * PHOTO.scale}`, src: await dataUrl(`${n.file}.jpg`), width: PHOTO.width, height: PHOTO.height });
  }
  for (const c of chats) {
    const masking = JSON.parse(await readFile(join(dirs.masking, `${c.id}.json`), "utf8"));
    sections[2].tiles.push({ label: `${c.file}.png`, sub: `${masking.boxes.length} masking boxes`, src: await dataUrl(`${c.file}.png`), width: masking.width, height: masking.height, boxes: masking.boxes });
  }
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
  await page.setContent(sheetHtml(sections), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const path = join(dirs.out, "contact-sheet.png");
  await page.screenshot({ path, fullPage: true });
  await page.close();
  console.log(`contact sheet  ${path}`);
}

for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
const browser = await chromium.launch();
try {
  for (const spec of pick(notices)) await renderNotice(browser, spec);
  for (const spec of pick(chats)) await renderChat(browser, spec);
  await renderSheet(browser);
} finally {
  await browser.close();
}
