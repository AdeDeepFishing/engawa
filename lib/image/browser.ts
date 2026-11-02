/**
 * Browser-side image preparation. Re-encoding through a canvas drops EXIF
 * (including GPS), applies the orientation flag and keeps the long edge at
 * or under 1568px, which is what the vision model works best with.
 */

export const MAX_LONG_EDGE = 1568;
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const JPEG_QUALITY = 0.85;

type Drawable = ImageBitmap | HTMLImageElement;

async function loadDrawable(file: Blob): Promise<Drawable> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers cannot decode every format through createImageBitmap.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded bitmap stays usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function sizeOf(d: Drawable): { width: number; height: number } {
  if ("naturalWidth" in d) return { width: d.naturalWidth, height: d.naturalHeight };
  return { width: d.width, height: d.height };
}

export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageTooLargeError();
  }
  const drawable = await loadDrawable(file);
  const { width, height } = sizeOf(drawable);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.drawImage(drawable, 0, 0, w, h);
  if ("close" in drawable) drawable.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("JPEG encoding failed");
  return blob;
}

export class ImageTooLargeError extends Error {
  constructor() {
    super("image too large");
    this.name = "ImageTooLargeError";
  }
}
