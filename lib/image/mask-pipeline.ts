/**
 * The masking step end to end, shared by the process route and the
 * coverage eval: shrink the stored screenshot to the frame the model sees,
 * ask Claude where the avatars, names, handles, phone and room numbers are,
 * map the boxes back to the stored frame, and paint the pink rectangles.
 * Everything here is pure JavaScript; the only network call is to Claude.
 */
import { maskBoxes, type MaskBox, type MaskEffort, type MaskOutcome } from "@/lib/claude/mask";
import type { ModelId } from "@/lib/claude/client";
import { drawMasks, type MaskStyle, type PixelBox } from "./mask";
import { decodeRaster, encodeRaster, JPEG_QUALITY, MODEL_LONG_EDGE, resizeToFit } from "./raster";
import type { StrippableMime } from "./strip";

/**
 * Masking runs in the pipeline only when this returns true. The default is
 * decided by the coverage eval in docs/EVAL.md (ship rule in docs/PLAN.md:
 * on only at 100 percent of the ground truth boxes, reached on 2026-11-03).
 * MASKING_ENABLED=0 turns it off, MASKING_ENABLED=1 turns it on.
 */
export const MASKING_DEFAULT = true;

export function maskingEnabled(): boolean {
  const v = process.env.MASKING_ENABLED;
  if (v === undefined || v === "") return MASKING_DEFAULT;
  return v === "1" || v.toLowerCase() === "true";
}

export interface MaskedScreenshot {
  /** The masked copy, in the same format as the input. */
  bytes: Uint8Array;
  mime: StrippableMime;
  width: number;
  height: number;
  /** Boxes in pixels of the input image, as validated, before padding. */
  boxes: MaskBox[];
  /** The padded boxes that were painted, in pixels of the input image. */
  drawn: PixelBox[];
  /** The frame the model saw. */
  modelFrame: { width: number; height: number; scaleX: number; scaleY: number };
  outcome: MaskOutcome;
}

/**
 * Masks one chat screenshot. Throws MaskError on a refusal or an invalid
 * answer and the SDK's errors on API failure; the caller decides that a
 * failure must not block the card.
 */
export async function maskScreenshot(
  bytes: Uint8Array,
  mime: StrippableMime,
  options: { model?: ModelId; effort?: MaskEffort; style?: MaskStyle } = {},
): Promise<MaskedScreenshot> {
  const original = decodeRaster(bytes, mime);
  const { raster: small, scaleX, scaleY } = resizeToFit(original, MODEL_LONG_EDGE);
  // The model copy is always JPEG: smaller to send, and the coordinates do not depend on the format.
  const modelBytes = encodeRaster(small, "image/jpeg", JPEG_QUALITY);
  const outcome = await maskBoxes(
    { data: Buffer.from(modelBytes).toString("base64"), mediaType: "image/jpeg" },
    { width: small.width, height: small.height },
    { model: options.model, effort: options.effort },
  );
  const boxes: MaskBox[] = outcome.result.boxes.map((b) => {
    const x0 = Math.max(0, Math.floor(b.x / scaleX));
    const y0 = Math.max(0, Math.floor(b.y / scaleY));
    const x1 = Math.min(original.width, Math.ceil((b.x + b.w) / scaleX));
    const y1 = Math.min(original.height, Math.ceil((b.y + b.h) / scaleY));
    return { ...b, x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  });
  const drawn = drawMasks(original, boxes, options.style);
  return {
    bytes: encodeRaster(original, mime),
    mime,
    width: original.width,
    height: original.height,
    boxes,
    drawn,
    modelFrame: { width: small.width, height: small.height, scaleX, scaleY },
    outcome,
  };
}
