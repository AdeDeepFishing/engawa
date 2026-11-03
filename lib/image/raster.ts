/**
 * Pure JavaScript raster helpers for the masking step: decode a JPEG or PNG
 * to RGBA, shrink it to the frame the model sees, and encode it again.
 * pngjs and jpeg-js are pure JS, so this runs wherever the stripper runs.
 */
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import type { StrippableMime } from "./strip";

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, rows top to bottom. */
  data: Uint8Array;
}

/** Long edge of the image sent to the model, the same limit the browser applies to uploads. */
export const MODEL_LONG_EDGE = 1568;

/** JPEG quality for re-encoded masked copies and for the model copy. */
export const JPEG_QUALITY = 85;

export function decodeRaster(bytes: Uint8Array, mime: StrippableMime): Raster {
  if (mime === "image/png") {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
  }
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { width: img.width, height: img.height, data: img.data };
}

export function encodeRaster(raster: Raster, mime: StrippableMime, quality = JPEG_QUALITY): Uint8Array {
  if (mime === "image/png") {
    const png = new PNG({ width: raster.width, height: raster.height });
    png.data = Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength);
    const out = PNG.sync.write(png);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  const out = jpeg.encode({ width: raster.width, height: raster.height, data: raster.data }, quality).data;
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export interface Resized {
  raster: Raster;
  /** Factor from the original frame to the resized one, per axis (1 when nothing changed). */
  scaleX: number;
  scaleY: number;
}

/**
 * Shrinks the raster so its long edge is at most `maxLongEdge`, averaging
 * the source pixels behind each output pixel (a box filter). Images that
 * already fit are returned as they are.
 */
export function resizeToFit(raster: Raster, maxLongEdge = MODEL_LONG_EDGE): Resized {
  const long = Math.max(raster.width, raster.height);
  if (long <= maxLongEdge) return { raster, scaleX: 1, scaleY: 1 };
  const factor = maxLongEdge / long;
  const w = Math.max(1, Math.round(raster.width * factor));
  const h = Math.max(1, Math.round(raster.height * factor));
  const src = raster.data;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * raster.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * raster.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * raster.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * raster.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let i = (sy * raster.width + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx++) {
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          i += 4;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { raster: { width: w, height: h, data: out }, scaleX: w / raster.width, scaleY: h / raster.height };
}
