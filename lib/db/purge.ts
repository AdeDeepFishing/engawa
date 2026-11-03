import { db, SUBMISSIONS_BUCKET } from "./client";

export interface PurgeReport {
  ranAt: string;
  storageObjectsDeleted: number;
  submissionsDeleted: number;
  cardsDeleted: number;
  devicesDeleted: number;
  errors: string[];
}

/**
 * Deletes everything whose purge_after has passed: storage objects first
 * (submission images, then masked copies that belong to cards), then rows. Runs once a day from the Vercel cron and on demand via
 * `pnpm purge`. card_sources go with their card or submission (cascade).
 */
export async function runPurge(now = new Date()): Promise<PurgeReport> {
  const client = db();
  const nowIso = now.toISOString();
  const report: PurgeReport = {
    ranAt: nowIso,
    storageObjectsDeleted: 0,
    submissionsDeleted: 0,
    cardsDeleted: 0,
    devicesDeleted: 0,
    errors: [],
  };

  // 1. Submissions past purge_after: delete their images, then the rows.
  const { data: subs, error: subErr } = await client
    .from("submissions")
    .select("id, image_path, image_deleted_at")
    .lt("purge_after", nowIso)
    .limit(500);
  if (subErr) report.errors.push(`select submissions: ${subErr.message}`);
  const paths = (subs ?? [])
    .filter((s) => s.image_path && !s.image_deleted_at)
    .map((s) => s.image_path as string);
  if (paths.length) {
    const { data: removed, error } = await client.storage.from(SUBMISSIONS_BUCKET).remove(paths);
    if (error) report.errors.push(`storage remove: ${error.message}`);
    report.storageObjectsDeleted += removed?.length ?? 0;
  }
  if (subs?.length) {
    const ids = subs.map((s) => s.id);
    const { error } = await client.from("submissions").delete().in("id", ids);
    if (error) report.errors.push(`delete submissions: ${error.message}`);
    else report.submissionsDeleted = ids.length;
  }

  // 2. Cards past purge_after: their masked screenshot copies first, then the rows.
  const { data: cards, error: cardErr } = await client
    .from("cards")
    .select("id, masked_image_path")
    .lt("purge_after", nowIso)
    .limit(500);
  if (cardErr) report.errors.push(`select cards: ${cardErr.message}`);
  const maskedPaths = (cards ?? [])
    .map((c) => c.masked_image_path as string | null)
    .filter((p): p is string => Boolean(p));
  if (maskedPaths.length) {
    const { data: removed, error } = await client.storage.from(SUBMISSIONS_BUCKET).remove(maskedPaths);
    if (error) report.errors.push(`storage remove masked: ${error.message}`);
    report.storageObjectsDeleted += removed?.length ?? 0;
  }
  if (cards?.length) {
    const ids = cards.map((c) => c.id);
    const { error } = await client.from("cards").delete().in("id", ids);
    if (error) report.errors.push(`delete cards: ${error.message}`);
    else report.cardsDeleted = ids.length;
  }

  // 3. Devices not seen for 90 days.
  const { data: devices, error: devErr } = await client
    .from("devices")
    .select("device_id")
    .lt("purge_after", nowIso)
    .limit(500);
  if (devErr) report.errors.push(`select devices: ${devErr.message}`);
  if (devices?.length) {
    const ids = devices.map((d) => d.device_id);
    const { error } = await client.from("devices").delete().in("device_id", ids);
    if (error) report.errors.push(`delete devices: ${error.message}`);
    else report.devicesDeleted = ids.length;
  }

  return report;
}
