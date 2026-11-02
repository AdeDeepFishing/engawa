import { NextResponse, type NextRequest } from "next/server";
import { hasDb } from "@/lib/db/client";
import { runPurge } from "@/lib/db/purge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily purge, called by the Vercel cron (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when that variable is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ error: "no_database" }, { status: 503 });
  const report = await runPurge();
  return NextResponse.json(report, { status: report.errors.length ? 500 : 200 });
}
