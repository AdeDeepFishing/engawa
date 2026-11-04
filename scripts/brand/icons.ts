/**
 * Writes the two static icon files from the mark in components/brand/Mark.tsx,
 * so they never drift from it:
 *
 *   app/icon.svg      the mark alone, in the accent (the paper colour when the
 *                     browser is in dark mode), the favicon most browsers use
 *   app/favicon.ico   the 32 px PNG of app/icon.tsx wrapped in an ICO, for
 *                     clients that ask for /favicon.ico
 *
 *   pnpm brand:icons            write both files
 *   pnpm brand:icons --check    exit 1 if either file differs from the mark
 *
 * Run it after changing MARK_VARIANT or the mark's geometry.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BRAND, MARK_PATH, MARK_VIEWBOX } from "../../components/brand/Mark";
import Icon, { size } from "../../app/icon";

function iconSvg(): string {
  const style = `path{fill:${BRAND.accent}}@media (prefers-color-scheme:dark){path{fill:${BRAND.paper}}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><style>${style}</style><path fill-rule="evenodd" d="${MARK_PATH}"/></svg>\n`;
}

/** An ICO with one PNG image: a 6 byte header, one 16 byte directory entry, then the PNG. */
function ico(png: Buffer, px: number): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(1, 4); // one image
  head.writeUInt8(px, 6); // width
  head.writeUInt8(px, 7); // height
  head.writeUInt8(0, 8); // no palette
  head.writeUInt8(0, 9); // reserved
  head.writeUInt16LE(1, 10); // colour planes
  head.writeUInt16LE(32, 12); // bits per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18); // the PNG starts right after the entry
  return Buffer.concat([head, png]);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const png = Buffer.from(await Icon().arrayBuffer());
  const files: [string, Buffer][] = [
    ["app/icon.svg", Buffer.from(iconSvg())],
    ["app/favicon.ico", ico(png, size.width)],
  ];
  let stale = 0;
  for (const [path, data] of files) {
    if (check) {
      const same = readFileSync(path).equals(data);
      if (!same) stale++;
      console.log(`${same ? "ok   " : "stale"} ${path}`);
    } else {
      writeFileSync(path, data);
      console.log(`wrote ${path} (${data.length} bytes)`);
    }
  }
  if (stale) {
    console.error(`${stale} file(s) differ from the mark: run pnpm brand:icons`);
    process.exit(1);
  }
}

main();
