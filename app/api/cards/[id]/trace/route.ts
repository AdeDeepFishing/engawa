import { type NextRequest } from "next/server";
import { hasDb } from "@/lib/db/client";
import { getPublicCardTrace } from "@/lib/db/cards";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How one public card was made: its source rows oldest first with the
 * reconcile reason and the model behind each, and the models used. 404 for
 * held, hidden and unknown cards, like the masked image route. Not cached:
 * a card hidden by the admin must stop answering at once.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb() || !UUID_RE.test(id)) return new Response(null, { status: 404 });
  const trace = await getPublicCardTrace(id);
  if (!trace) return new Response(null, { status: 404 });
  return Response.json(trace, { headers: { "Cache-Control": "no-store" } });
}
