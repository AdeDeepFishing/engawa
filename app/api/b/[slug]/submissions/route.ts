import { NextResponse, type NextRequest } from "next/server";
import { getBoardBySlug } from "@/lib/db/boards";
import { hasDb } from "@/lib/db/client";
import {
  assertRateLimits,
  createSubmission,
  RateLimitError,
  touchDevice,
} from "@/lib/db/submissions";
import { stripImageMetadata } from "@/lib/image/strip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const DEVICE_RE = /^[0-9a-f-]{36}$/;

/**
 * Creates a submission. multipart/form-data with:
 *   kind      "image" or "text"
 *   device_id browser identifier
 *   consent   "1" when the purpose notice was accepted
 *   image     the browser-compressed JPEG (or PNG)
 *   text      pasted text
 * The image is stripped of metadata here, before it is stored, so no
 * unstripped copy ever exists on the server side.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return NextResponse.json({ error: "no_database" }, { status: 503 });
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const kind = form.get("kind");
  const deviceId = form.get("device_id");
  const consent = form.get("consent") === "1";
  if ((kind !== "image" && kind !== "text") || typeof deviceId !== "string" || !DEVICE_RE.test(deviceId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    await assertRateLimits(board.id, deviceId);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited", scope: e.scope }, { status: 429 });
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
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
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
  });
  return NextResponse.json({ id: sub.id, status: sub.status }, { status: 201 });
}
