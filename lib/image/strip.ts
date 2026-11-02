/**
 * Pure JavaScript metadata stripping for JPEG and PNG. No native libraries,
 * so it runs the same on Node, Vercel functions and edge runtimes.
 *
 * JPEG: every APPn and COM segment is dropped except JFIF (APP0), the ICC
 * profile (APP2) and the Adobe colour transform (APP14), which carry no
 * personal data. Anything after EOI (motion photo video trailers, for
 * example) is discarded.
 *
 * PNG: only critical chunks and a short list of harmless ancillary chunks
 * are kept. Text chunks (tEXt, zTXt, iTXt), eXIf, tIME and unknown private
 * chunks are dropped.
 */

export type StrippableMime = "image/jpeg" | "image/png";

export interface StripResult {
  bytes: Uint8Array;
  mime: StrippableMime;
  removedSegments: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(bytes: Uint8Array): StrippableMime | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  return null;
}

export function stripImageMetadata(bytes: Uint8Array): StripResult {
  const mime = sniffImage(bytes);
  if (mime === "image/jpeg") return { ...stripJpeg(bytes), mime };
  if (mime === "image/png") return { ...stripPng(bytes), mime };
  throw new Error("Unsupported image format: only JPEG and PNG are accepted");
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function keepJpegSegment(bytes: Uint8Array, marker: number, payloadStart: number): boolean {
  if (marker === 0xfe) return false; // COM
  if (marker >= 0xe0 && marker <= 0xef) {
    if (marker === 0xe0) return asciiAt(bytes, payloadStart, "JFIF\0");
    if (marker === 0xe2) return asciiAt(bytes, payloadStart, "ICC_PROFILE\0");
    if (marker === 0xee) return asciiAt(bytes, payloadStart, "Adobe");
    return false;
  }
  return true; // SOF, DHT, DQT, DRI, SOS and friends
}

export function stripJpeg(bytes: Uint8Array): { bytes: Uint8Array; removedSegments: number } {
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let removed = 0;
  let pos = 2;
  let scanStart = -1;

  while (pos < bytes.length) {
    if (scanStart >= 0) {
      // Inside entropy-coded data: skip until a real marker appears.
      if (bytes[pos] !== 0xff) {
        pos++;
        continue;
      }
      const next = bytes[pos + 1];
      if (next === undefined) break;
      if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
        pos += next === 0xff ? 1 : 2;
        continue;
      }
      out.push(bytes.subarray(scanStart, pos));
      scanStart = -1;
    }

    if (bytes[pos] !== 0xff) throw new Error("Malformed JPEG: expected a marker");
    let marker = bytes[pos + 1];
    while (marker === 0xff && pos + 2 < bytes.length) {
      pos++;
      marker = bytes[pos + 1];
    }
    if (marker === undefined) break;

    if (marker === 0xd9) {
      out.push(bytes.subarray(pos, pos + 2)); // EOI, drop any trailer after it
      pos = bytes.length;
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.length) throw new Error("Malformed JPEG: truncated segment");
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (length < 2 || pos + 2 + length > bytes.length) {
      throw new Error("Malformed JPEG: bad segment length");
    }
    const end = pos + 2 + length;
    if (keepJpegSegment(bytes, marker, pos + 4)) {
      out.push(bytes.subarray(pos, end));
    } else {
      removed++;
    }
    pos = end;
    if (marker === 0xda) scanStart = pos; // SOS: entropy data follows
  }
  if (scanStart >= 0) out.push(bytes.subarray(scanStart));
  return { bytes: concat(out), removedSegments: removed };
}

const PNG_KEEP = new Set([
  "IHDR", "PLTE", "IDAT", "IEND",
  "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs", "hIST", "sPLT",
  "acTL", "fcTL", "fdAT",
]);

export function stripPng(bytes: Uint8Array): { bytes: Uint8Array; removedSegments: number } {
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let removed = 0;
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length =
      ((bytes[pos] << 24) >>> 0) + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3];
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const total = 12 + length;
    if (pos + total > bytes.length) throw new Error("Malformed PNG: truncated chunk");
    if (PNG_KEEP.has(type)) {
      out.push(bytes.subarray(pos, pos + total));
    } else {
      removed++;
    }
    pos += total;
    if (type === "IEND") break;
  }
  return { bytes: concat(out), removedSegments: removed };
}
