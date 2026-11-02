import { randomUUID } from "node:crypto";
import { db, SUBMISSIONS_BUCKET } from "./client";
import { applyDecision, insertCard, listReconcileCandidates, type AppliedCard, type SourceContext } from "./cards";
import { addDays, addHours } from "@/lib/cards/categories";
import type { ExtractFact, ExtractResult } from "@/lib/claude/extract";
import type { ReconcileCandidate, ReconcileDecision } from "@/lib/claude/reconcile";
import type { Board, Platform, ReconcileAction, Submission } from "@/lib/types";

/** Submissions stuck in processing longer than this are marked failed on the next read. */
export const STUCK_AFTER_MS = 120_000;
/** Until processing finishes, a submission and its image live at most this long. */
const PENDING_RETENTION_HOURS = 24;
const DEVICE_RETENTION_DAYS = 90;

export const RATE_LIMITS = { perDevicePerMinute: 3, perBoardPerMinute: 30 } as const;

export class RateLimitError extends Error {
  constructor(public scope: "device" | "board") {
    super(`rate limit: ${scope}`);
    this.name = "RateLimitError";
  }
}

export async function touchDevice(deviceId: string, consented: boolean): Promise<void> {
  const now = new Date();
  const row: Record<string, unknown> = {
    device_id: deviceId,
    last_seen: now.toISOString(),
    purge_after: addDays(now, DEVICE_RETENTION_DAYS),
  };
  if (consented) row.consented_at = now.toISOString();
  const { error } = await db().from("devices").upsert(row, { onConflict: "device_id" });
  if (error) throw error;
}

export async function assertRateLimits(boardId: string, deviceId: string): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const client = db();
  const [dev, brd] = await Promise.all([
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", since),
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("board_id", boardId)
      .gte("created_at", since),
  ]);
  if (dev.error) throw dev.error;
  if (brd.error) throw brd.error;
  if ((dev.count ?? 0) >= RATE_LIMITS.perDevicePerMinute) throw new RateLimitError("device");
  if ((brd.count ?? 0) >= RATE_LIMITS.perBoardPerMinute) throw new RateLimitError("board");
}

export interface NewSubmission {
  boardId: string;
  deviceId: string;
  inputKind: "image" | "text";
  text?: string;
  image?: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" };
  uploaderAreaCode?: string | null;
}

/** Uploads the already-stripped image (if any) and inserts the submission row. */
export async function createSubmission(input: NewSubmission): Promise<Submission> {
  const client = db();
  const id = randomUUID();
  let imagePath: string | null = null;
  if (input.image) {
    const ext = input.image.mime === "image/png" ? "png" : "jpg";
    imagePath = `${input.boardId}/${id}.${ext}`;
    const { error } = await client.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(imagePath, input.image.bytes, { contentType: input.image.mime, upsert: false });
    if (error) throw error;
  }
  const now = new Date();
  const row = {
    id,
    board_id: input.boardId,
    device_id: input.deviceId,
    input_kind: input.inputKind,
    text_raw: input.text ?? null,
    image_path: imagePath,
    uploader_area_code: input.uploaderAreaCode ?? null,
    status: "received",
    purge_after: addHours(now, PENDING_RETENTION_HOURS),
  };
  const { data, error } = await client.from("submissions").insert(row).select("*").single();
  if (error) {
    if (imagePath) await client.storage.from(SUBMISSIONS_BUCKET).remove([imagePath]);
    throw error;
  }
  return data as Submission;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const { data, error } = await db().from("submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Submission | null) ?? null;
}

/**
 * Claims a submission for processing. Returns false when another request
 * already holds it (status processing and not yet stuck) or it is finished.
 */
export async function claimForProcessing(id: string, firstStage: Submission["stage"]): Promise<boolean> {
  const { data, error } = await db()
    .from("submissions")
    .update({ status: "processing", stage: firstStage, error: null })
    .eq("id", id)
    .in("status", ["received", "failed"])
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function setStage(id: string, stage: Submission["stage"]): Promise<void> {
  const { error } = await db().from("submissions").update({ stage }).eq("id", id);
  if (error) throw error;
}

export async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await db()
    .from("submissions")
    .update({ status: "failed", stage: "failed", error: message.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

/** Watchdog: anything processing for over two minutes is failed and can be retried. */
export async function failStuckSubmissions(boardId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { error } = await db()
    .from("submissions")
    .update({ status: "failed", stage: "failed", error: "timed out" })
    .eq("board_id", boardId)
    .eq("status", "processing")
    .lt("created_at", cutoff);
  if (error) console.error("failStuckSubmissions", error.message);
}

export async function downloadSubmissionImage(sub: Submission): Promise<Uint8Array | null> {
  if (!sub.image_path) return null;
  const { data, error } = await db().storage.from(SUBMISSIONS_BUCKET).download(sub.image_path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteSubmissionImage(sub: Submission): Promise<void> {
  if (!sub.image_path || sub.image_deleted_at) return;
  const client = db();
  const { error } = await client.storage.from(SUBMISSIONS_BUCKET).remove([sub.image_path]);
  if (error) throw error;
  const { error: e2 } = await client
    .from("submissions")
    .update({ image_deleted_at: new Date().toISOString() })
    .eq("id", sub.id);
  if (e2) throw e2;
}

export interface WrittenCards {
  publicIds: string[];
  heldIds: string[];
  latestPurgeAfter: string | null;
  /** One entry per fact, in order: what reconcile did and to which card. */
  decisions: { action: ReconcileAction; card_id: string; reason: string }[];
}

/** Proposes a checked decision for one fact against its candidates (the route wires in Claude). */
export type DecideFn = (fact: ExtractFact, candidates: ReconcileCandidate[]) => Promise<ReconcileDecision>;

/**
 * Turns validated facts into card changes. Facts with any risk flag skip
 * reconcile and are inserted as held. Every other fact is compared with the
 * candidates code selects, and `decide` says whether it creates, merges,
 * updates, contradicts or is held. Without `decide`, every fact becomes its
 * own card (the day 1 behaviour, kept for scripts).
 * Facts are applied one after another so a later fact sees an earlier one.
 */
export async function writeCardsForSubmission(
  board: Board,
  sub: Submission,
  result: ExtractResult,
  options: { decide?: DecideFn; now?: Date } = {},
): Promise<WrittenCards> {
  const now = options.now ?? new Date();
  const out: WrittenCards = { publicIds: [], heldIds: [], latestPurgeAfter: null, decisions: [] };
  const ctx: SourceContext = { board, sub, platform: result.source_platform, inputLanguage: result.input_language };

  for (const fact of result.facts) {
    let applied: AppliedCard;
    if (fact.risk_flags.length > 0) {
      applied = await insertCard(
        ctx,
        fact,
        { visibility: "held", heldReason: Array.from(new Set(fact.risk_flags)).join(",") },
        { action: "hold", reason: "risk flags" },
        now,
      );
    } else if (options.decide) {
      const candidates = await listReconcileCandidates(board, fact, now);
      const decision = await options.decide(fact, candidates);
      applied = await applyDecision(ctx, fact, decision, now);
    } else {
      applied = await insertCard(ctx, fact, { visibility: "public", heldReason: null }, { action: "create", reason: "no reconcile" }, now);
    }
    const ids = applied.visibility === "held" ? out.heldIds : out.publicIds;
    if (!ids.includes(applied.id)) ids.push(applied.id);
    if (!out.latestPurgeAfter || new Date(applied.purge_after) > new Date(out.latestPurgeAfter)) {
      out.latestPurgeAfter = applied.purge_after;
    }
    out.decisions.push({ action: applied.action, card_id: applied.id, reason: applied.reason });
  }
  return out;
}

export async function finishSubmission(
  sub: Submission,
  args: {
    platform: Platform;
    written: WrittenCards;
    heldReason: string | null;
    deleteImage: boolean;
  },
): Promise<void> {
  const client = db();
  const now = new Date();
  const cardIds = [...args.written.publicIds, ...args.written.heldIds];
  const status =
    cardIds.length > 0 && args.written.publicIds.length === 0 ? "held" : "done";
  const purgeAfter = args.written.latestPurgeAfter ?? addHours(now, PENDING_RETENTION_HOURS);
  const { error } = await client
    .from("submissions")
    .update({
      status,
      stage: "done",
      detected_platform: args.platform,
      card_ids: cardIds,
      held_reason: args.heldReason,
      text_raw: null,
      processed_at: now.toISOString(),
      purge_after: purgeAfter,
    })
    .eq("id", sub.id);
  if (error) throw error;
  if (args.deleteImage) await deleteSubmissionImage(sub);
}
