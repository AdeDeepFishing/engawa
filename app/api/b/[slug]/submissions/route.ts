import { NextResponse, type NextRequest } from "next/server";
import { getBoardBySlug } from "@/lib/db/boards";
import { isBoardAreaCode } from "@/lib/geo";
import { assertUnderCap, BusyError } from "@/lib/claude/usage";
import { hasDb } from "@/lib/db/client";
import {
  assertRateLimits,
  createSubmission,
  RATE_LIMITS,
  RateLimitError,
  touchDevice,
} from "@/lib/db/submissions";
import { stripImageMetadata } from "@/lib/image/strip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
/** Room for the multipart envelope and the other fields around the image. */
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const DEVICE_RE = /^[0-9a-f-]{36}$/;

/**
 * Error responses with stable codes the client maps to messages:
 *   400 bad_request       malformed form
 *   404 board_not_found
 *   413 too_large         image over 8 MB (max_bytes in the body)
 *   415 unsupported_image not JPEG or PNG
 *   429 rate_limited      scope "device" (3 a minute) or "board" (30 a minute), Retry-After 60
 *   503 busy              daily Claude call cap reached, Retry-After 3600
 *   503 no_database       server runs without a database
 */
function tooLarge() {
  return NextResponse.json({ error: "too_large", max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
}

/**
 * Creates a submission. multipart/form-data with:
 *   kind      "image" or "text"
 *   device_id browser identifier
 *   consent   "1" when the purpose notice was accepted
 *   image     the browser-compressed JPEG (or PNG)
 *   text      pasted text
 *   area_code optional 町丁目 code the browser resolved from the board's polygons
 *             (G2, self-reported); anything not among the board's areas is stored as null
 * The image is stripped of metadata here, before it is stored, so no
 * unstripped copy ever exists on the server side.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return NextResponse.json({ error: "no_database" }, { status: 503 });
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const kind = form.get("kind");
  const deviceId = form.get("device_id");
  const consent = form.get("consent") === "1";
  // The browser only ever sends a code, never a position; the code must be one of this board's areas.
  const areaRaw = form.get("area_code");
  const uploaderAreaCode = isBoardAreaCode(board, areaRaw) ? areaRaw : null;
  if ((kind !== "image" && kind !== "text") || typeof deviceId !== "string" || !DEVICE_RE.test(deviceId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await assertRateLimits(board.id, deviceId);
  } catch (e) {
    if (e instanceof RateLimitError) {
      const limit = e.scope === "device" ? RATE_LIMITS.perDevicePerMinute : RATE_LIMITS.perBoardPerMinute;
      return NextResponse.json(
        { error: "rate_limited", scope: e.scope, limit_per_minute: limit },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    throw e;
  }

  // Refuse before storing anything when processing could not run today.
  try {
    await assertUnderCap();
  } catch (e) {
    if (e instanceof BusyError) {
      return NextResponse.json({ error: "busy" }, { status: 503, headers: { "Retry-After": "3600" } });
    }
    throw e;
  }

  let text: string | undefined;
  let image: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" } | undefined;
  if (kind === "text") {
    const raw = form.get("text");
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    text = raw.trim().slice(0, MAX_TEXT_CHARS);
  } else {
    const file = form.get("image");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return tooLarge();
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const stripped = stripImageMetadata(bytes);
      image = { bytes: stripped.bytes, mime: stripped.mime };
    } catch {
      return NextResponse.json({ error: "unsupported_image" }, { status: 415 });
    }
  }

  await touchDevice(deviceId, consent);
  const sub = await createSubmission({
    boardId: board.id,
    deviceId,
    inputKind: kind,
    text,
    image,
    uploaderAreaCode,
  });
  return NextResponse.json({ id: sub.id, status: sub.status }, { status: 201 });
}
