import { type NextRequest } from "next/server";
import { hasDb } from "@/lib/db/client";
import { getPublicCardTrace } from "@/lib/db/cards";
import { isUuid } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * How one public card was made: its source rows oldest first with the
 * reconcile reason and the model behind each, and the model ids on record. 404 for
 * held, hidden and unknown cards, like the masked image route. Not cached:
 * a card hidden by the admin must stop answering at once.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb() || !isUuid(id)) return new Response(null, { status: 404 });
  const trace = await getPublicCardTrace(id);
  if (!trace) return new Response(null, { status: 404 });
  return Response.json(trace, { headers: { "Cache-Control": "no-store" } });
}
