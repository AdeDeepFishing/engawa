import { type NextRequest } from "next/server";
import { hasDb } from "@/lib/db/client";
import { getPublicMaskedImage } from "@/lib/db/masked";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves the masked copy of a chat screenshot for one public card. The
 * browser never sees a Storage URL: the object is read with the service
 * role and streamed from here. 404 for held, hidden and unknown cards and
 * for cards without a masked copy. Not cached anywhere: a card hidden by
 * the admin must disappear with its image at once.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb() || !UUID_RE.test(id)) return new Response(null, { status: 404 });
  const image = await getPublicMaskedImage(id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
