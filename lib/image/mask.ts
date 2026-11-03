/**
 * Pure JavaScript drawing for the masking step: fills padded rounded
 * rectangles over the boxes the model returned, then re-encodes the image
 * in its own format (PNG stays PNG, JPEG is written at quality 85).
 */
import { decodeRaster, encodeRaster, type Raster } from "./raster";
import type { StrippableMime } from "./strip";

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pink fill, corner radius and padding from docs/PLAN.md G1. */
export const MASK_FILL = "#f5a3c7";
export const MASK_RADIUS = 8;
export const MASK_PAD = 4;
/**
 * Text boxes (names, handles, numbers) get more room than avatars: the
 * model boxes the glyphs, while what must disappear is the whole line.
 * Numbers inside running text (room, phone, handle) also get one character
 * of extra room on each side, one text height wide, because the model's
 * left edge on such a run can land a character late. Both measured on the
 * masking fixtures (docs/EVAL.md).
 */
export const MASK_PAD_TEXT = 10;
export const INLINE_KINDS = new Set(["room", "phone", "handle"]);

export interface MaskStyle {
  fill?: string;
  radius?: number;
  /** Padding for avatar boxes, and for boxes without a kind. */
  pad?: number;
  /** Padding for text boxes. */
  padText?: number;
}

/** A box with the kind the model gave it; kind decides the padding. */
export interface KindBox extends PixelBox {
  kind?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`mask fill must be a 6 digit hex colour, got ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Grows a box by `pad` on every side (`padX` sideways when given) and clips it to the image. Null when nothing is left. */
export function padBox(box: PixelBox, pad: number, width: number, height: number, padX = pad): PixelBox | null {
  const x0 = Math.max(0, Math.floor(box.x - padX));
  const y0 = Math.max(0, Math.floor(box.y - pad));
  const x1 = Math.min(width, Math.ceil(box.x + box.w + padX));
  const y1 = Math.min(height, Math.ceil(box.y + box.h + pad));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Fills one rounded rectangle in place. The box must already lie inside the raster. */
export function fillRoundedRect(raster: Raster, box: PixelBox, radius: number, rgb: [number, number, number]): void {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const r = Math.max(0, Math.min(radius, box.w / 2, box.h / 2));
  const r2 = r * r;
  const d = raster.data;
  for (let py = y0; py < y1; py++) {
    const cy = py + 0.5;
    const topCorner = cy < y0 + r;
    const bottomCorner = cy > y1 - r;
    for (let px = x0; px < x1; px++) {
      const cx = px + 0.5;
      if (topCorner || bottomCorner) {
        const leftCorner = cx < x0 + r;
        const rightCorner = cx > x1 - r;
        if (leftCorner || rightCorner) {
          const ox = leftCorner ? x0 + r : x1 - r;
          const oy = topCorner ? y0 + r : y1 - r;
          const dx = cx - ox;
          const dy = cy - oy;
          if (dx * dx + dy * dy > r2) continue;
        }
      }
      const i = (py * raster.width + px) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = 255;
    }
  }
}

/** Draws every box, padded by kind and clipped, onto the raster. Returns the padded boxes it drew. */
export function drawMasks(raster: Raster, boxes: KindBox[], style: MaskStyle = {}): PixelBox[] {
  const rgb = hexToRgb(style.fill ?? MASK_FILL);
  const radius = style.radius ?? MASK_RADIUS;
  const pad = style.pad ?? MASK_PAD;
  const padText = style.padText ?? MASK_PAD_TEXT;
  const drawn: PixelBox[] = [];
  for (const box of boxes) {
    const isText = box.kind !== undefined && box.kind !== "avatar";
    const inline = box.kind !== undefined && INLINE_KINDS.has(box.kind);
    const padded = padBox(box, isText ? padText : pad, raster.width, raster.height, inline ? padText + box.h : undefined);
    if (!padded) continue;
    fillRoundedRect(raster, padded, radius, rgb);
    drawn.push(padded);
  }
  return drawn;
}

/** Decodes, draws and re-encodes. Boxes are in pixels of `bytes`. */
export function maskImage(
  bytes: Uint8Array,
  mime: StrippableMime,
  boxes: KindBox[],
  style: MaskStyle = {},
): { bytes: Uint8Array; mime: StrippableMime; drawn: PixelBox[]; width: number; height: number } {
  const raster = decodeRaster(bytes, mime);
  const drawn = drawMasks(raster, boxes, style);
  return { bytes: encodeRaster(raster, mime), mime, drawn, width: raster.width, height: raster.height };
}
