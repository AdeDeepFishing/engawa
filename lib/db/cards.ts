import { db } from "./client";
import { clearReactions } from "./reactions";
import { addDays, addHours, CARD_RETENTION_DAYS, DEFAULT_VALID_HOURS } from "@/lib/cards/categories";
import { contentTime } from "@/lib/cards/display";
import { containsContact, type ExtractFact } from "@/lib/claude/extract";
import { trustRank } from "@/lib/cards/trust";
import type { ReconcileCandidate, ReconcileDecision } from "@/lib/claude/reconcile";
import type {
  Board,
  Card,
  CardFacts,
  CardSource,
  CardTrace,
  ConflictStatement,
  Platform,
  ReconcileAction,
  Submission,
  TraceStep,
  Visibility,
} from "@/lib/types";

/** At most this many candidates go to the model (lib/claude/README.md). */
const CANDIDATE_LIMIT = 20;
/** Expired cards stay candidates for this long after creation. */
const CANDIDATE_RECENT_HOURS = 24;
/** Statements kept per card; older ones are dropped first. */
const MAX_STATEMENTS = 6;

/** Columns readers get with each card: card_sources without submission ids. */
export const CARD_WITH_SOURCES = "*, sources:card_sources(relation, source_type, platform, created_at)";

/** Sorts embedded sources oldest first; PostgREST returns them unordered. */
export function withSortedSources(card: Card): Card {
  if (!card.sources) return card;
  return { ...card, sources: [...card.sources].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
}

/** What a submission says about itself, shared by every fact in it. */
export interface SourceContext {
  board: Board;
  sub: Submission;
  platform: Platform;
  inputLanguage: string;
  /** Model that read the input; recorded on the `created` source row. Null when unknown (scripts). */
  extractModel?: string | null;
}

/** What a source row records about the decision behind it (migration 0005). */
interface SourceTrace {
  reason: string | null;
  model: string | null;
}

/**
 * Merge, update and conflict rows carry the model's reason and the reconcile
 * model. When code overrode the model's action (an update from a weaker
 * source kept as a conflict) the model's sentence argues for the action not
 * taken, so no reason is stored; the override itself is in the server log.
 * A reason is built from PII-stripped card text, but it reaches readers, so
 * it gets the same phone and email check as the extract output and is
 * dropped rather than stored when it fails.
 */
function traceOf(decision: ReconcileDecision): SourceTrace {
  let reason: string | null = decision.override ? null : decision.reason.trim() || null;
  if (reason && containsContact(reason)) {
    console.warn("reconcile reason dropped: it contains a phone number or email");
    reason = null;
  }
  return { reason, model: decision.model ?? null };
}

export interface AppliedCard {
  id: string;
  visibility: Visibility;
  purge_after: string;
  action: ReconcileAction;
  reason: string;
}

// --- candidates -------------------------------------------------------------

/**
 * Cards a new fact could merge with, update or contradict. Same board and
 * category, public, still valid or created in the last 24 hours, and at the
 * same place or with no place. Most recent first, at most 20.
 */
export async function listReconcileCandidates(
  board: Board,
  fact: ExtractFact,
  now = new Date(),
): Promise<ReconcileCandidate[]> {
  let query = db()
    .from("cards")
    .select("id, place_id, place_text_ja, facts, valid_from, valid_until, source_type, official_confirmed, source_count, title, created_at, updated_at")
    .eq("board_id", board.id)
    .eq("category", fact.category)
    .eq("visibility", "public");
  query = fact.place_id
    ? query.or(`place_id.eq."${fact.place_id}",place_id.is.null`)
    : query.is("place_id", null);
  // The time window is applied below: a few extra rows are cheaper than an or() over timestamps.
  const { data, error } = await query.order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT * 5);
  if (error) throw error;

  const recentSince = now.getTime() - CANDIDATE_RECENT_HOURS * 3_600_000;
  return ((data ?? []) as Card[])
    .filter(
      (c) =>
        c.valid_until === null ||
        new Date(c.valid_until).getTime() > now.getTime() ||
        new Date(c.created_at).getTime() > recentSince,
    )
    .slice(0, CANDIDATE_LIMIT)
    .map((c) => ({
      id: c.id,
      place_id: c.place_id,
      place_text_ja: c.place_text_ja,
      status: c.facts?.status ?? null,
      valid_from: c.valid_from,
      valid_until: c.valid_until,
      conditions: c.facts?.conditions ?? [],
      source_type: c.source_type,
      official_confirmed: c.official_confirmed,
      source_count: c.source_count,
      title_ja: c.title.ja,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
}

// --- applying decisions ----------------------------------------------------------

/** Card validity: the stated end, else the category default from the start (or now). */
function validity(fact: ExtractFact, now: Date): { validUntil: string; stated: boolean } {
  if (fact.valid_until) return { validUntil: fact.valid_until, stated: true };
  const from = fact.valid_from && new Date(fact.valid_from) > now ? fact.valid_from : now;
  return { validUntil: addHours(from, DEFAULT_VALID_HOURS[fact.category]), stated: false };
}

function factsOf(fact: ExtractFact, platform: Platform, validUntilStated: boolean): CardFacts {
  return {
    status: fact.status,
    conditions: fact.conditions,
    confidence: fact.confidence,
    platform,
    valid_until_stated: validUntilStated,
  };
}

/**
 * Applies one checked decision. Merge, update and conflict fall back to a
 * new card when the target is gone or no longer public by the time we get here.
 */
export async function applyDecision(
  ctx: SourceContext,
  fact: ExtractFact,
  decision: ReconcileDecision,
  now = new Date(),
): Promise<AppliedCard> {
  if (decision.action === "create") return insertCard(ctx, fact, { visibility: "public", heldReason: null }, decision, now);
  if (decision.action === "hold") {
    return insertCard(ctx, fact, { visibility: "held", heldReason: `reconcile: ${decision.reason}` }, decision, now);
  }
  const target = decision.target_card_id ? await getCard(ctx.board, decision.target_card_id) : null;
  if (!target || target.visibility !== "public") {
    console.warn(`reconcile target ${decision.target_card_id} unavailable, creating instead`);
    return insertCard(
      ctx,
      fact,
      { visibility: "public", heldReason: null },
      { action: "create", reason: `target gone: ${decision.reason}` },
      now,
    );
  }
  if (decision.action === "merge") return mergeIntoCard(ctx, fact, target, decision, now);
  if (decision.action === "update") return updateCard(ctx, fact, target, decision, now);
  return conflictCard(ctx, fact, target, decision, now);
}

/** Inserts a new card and its `created` source row. Facts with risk flags arrive here as held. */
export async function insertCard(
  ctx: SourceContext,
  fact: ExtractFact,
  opts: { visibility: "public" | "held"; heldReason: string | null },
  decision: Pick<ReconcileDecision, "action" | "reason">,
  now = new Date(),
): Promise<AppliedCard> {
  const { validUntil, stated } = validity(fact, now);
  const row = {
    board_id: ctx.board.id,
    category: fact.category,
    place_id: fact.place_id,
    place_text_ja: fact.place_text_ja,
    area_code: ctx.sub.uploader_area_code,
    title: fact.title,
    body: fact.body,
    facts: factsOf(fact, ctx.platform, stated),
    original_text: fact.original_excerpt || null,
    original_lang: ctx.inputLanguage,
    source_type: fact.source_type,
    official_confirmed: false,
    source_count: 1,
    risk_flags: fact.risk_flags,
    visibility: opts.visibility,
    held_reason: opts.heldReason,
    valid_from: fact.valid_from,
    valid_until: validUntil,
    mode_at_creation: ctx.board.mode,
    purge_after: addDays(validUntil, CARD_RETENTION_DAYS),
  };
  const { data, error } = await db().from("cards").insert(row).select("id, visibility, purge_after").single();
  if (error) throw error;
  const card = data as { id: string; visibility: Visibility; purge_after: string };
  // A create has no comparison to explain; the row names the model that read the input.
  await insertSource(ctx, card.id, fact, "created", { reason: null, model: ctx.extractModel ?? null });
  return { ...card, action: decision.action, reason: decision.reason };
}

/** Another source says the same thing: count it, and fill gaps if the model said so. */
async function mergeIntoCard(
  ctx: SourceContext,
  fact: ExtractFact,
  card: Card,
  decision: ReconcileDecision,
  now: Date,
): Promise<AppliedCard> {
  await insertSource(ctx, card.id, fact, "confirmed", traceOf(decision));
  const { error: rpcErr } = await db().rpc("bump_card_source", { p_card: card.id });
  if (rpcErr) throw rpcErr;

  const patch: Record<string, unknown> = {};
  // A stronger source backing the same statement raises the card's label.
  // official_confirmed is never touched here: only the admin route sets it.
  if (trustRank(fact.source_type) > trustRank(card.source_type)) patch.source_type = fact.source_type;
  if (decision.fill_missing) {
    if (!card.place_id && fact.place_id) patch.place_id = fact.place_id;
    if (!card.place_text_ja && fact.place_text_ja) patch.place_text_ja = fact.place_text_ja;
    if (!card.valid_from && fact.valid_from) patch.valid_from = fact.valid_from;
    const facts: CardFacts = { ...card.facts };
    let factsChanged = false;
    if (!facts.conditions?.length && fact.conditions.length) {
      facts.conditions = fact.conditions;
      factsChanged = true;
    }
    if ((!facts.status || facts.status === "unknown") && fact.status !== "unknown") {
      facts.status = fact.status;
      factsChanged = true;
    }
    // Only a default end time is replaced; a time some source stated stays.
    if (card.facts?.valid_until_stated === false && fact.valid_until) {
      patch.valid_until = fact.valid_until;
      patch.purge_after = addDays(fact.valid_until, CARD_RETENTION_DAYS);
      facts.valid_until_stated = true;
      factsChanged = true;
    }
    if (factsChanged) patch.facts = facts;
  }
  let purgeAfter = (patch.purge_after as string | undefined) ?? cardPurgeAfter(card, now);
  if (Object.keys(patch).length) {
    const { data, error } = await db()
      .from("cards")
      .update(patch)
      .eq("id", card.id)
      .select("purge_after")
      .single();
    if (error) throw error;
    purgeAfter = (data as { purge_after: string }).purge_after;
  }
  return { id: card.id, visibility: "public", purge_after: purgeAfter, action: "merge", reason: decision.reason };
}

/**
 * Same thing, newer value from a source at least as trusted (checked in
 * code). The card keeps its id and its source rows; the old content moves
 * into the statement history so readers see "previously: ...". The count
 * starts again at one: it says how many sources stand behind what the card
 * says now, and the superseded statement keeps its own count. Reader
 * confirmations are cleared for the same reason.
 * official_confirmed is not written here: only the admin route sets it, and
 * the trust check in reconcile turns any update to a confirmed card into a
 * conflict, so a confirmed card is never updated by this path.
 */
async function updateCard(
  ctx: SourceContext,
  fact: ExtractFact,
  card: Card,
  decision: ReconcileDecision,
  now: Date,
): Promise<AppliedCard> {
  const result = await writeWithRetry(card, (current) => {
    const { validUntil, stated } = validity(fact, now);
    const superseded: ConflictStatement = {
      ...statementFromCard(current, "superseded"),
      replaced_at: now.toISOString(),
    };
    // An update settles any open disagreement, so only the history is kept.
    const history = (current.conflict?.statements ?? []).filter((s) => s.kind === "superseded");
    const purge = addDays(validUntil, CARD_RETENTION_DAYS);
    return {
      title: fact.title,
      body: fact.body,
      facts: factsOf(fact, ctx.platform, stated),
      place_id: fact.place_id ?? current.place_id,
      place_text_ja: fact.place_text_ja ?? current.place_text_ja,
      original_text: fact.original_excerpt || null,
      original_lang: ctx.inputLanguage,
      source_type: fact.source_type,
      source_count: 1,
      last_confirmed_at: null,
      valid_from: fact.valid_from,
      valid_until: validUntil,
      conflict: { statements: [...history, superseded].slice(-MAX_STATEMENTS) },
      purge_after: laterOf(purge, cardPurgeAfter(current, now)),
    };
  });
  await insertSource(ctx, card.id, fact, "updated", traceOf(decision));
  // Reader confirmations were about the old content (N6).
  await clearReactions(card.id);
  return { id: card.id, visibility: "public", purge_after: result.purge_after, action: "update", reason: decision.reason };
}

/** Same attribute, different value, new source not more trusted: keep the card, show both statements. */
async function conflictCard(
  ctx: SourceContext,
  fact: ExtractFact,
  card: Card,
  decision: ReconcileDecision,
  now: Date,
): Promise<AppliedCard> {
  const result = await writeWithRetry(card, (current) => {
    const statements = [...(current.conflict?.statements ?? [])];
    if (!statements.some((s) => s.kind === "conflict")) statements.push(statementFromCard(current, "conflict"));
    statements.push(statementFromFact(fact, ctx.sub.id, now));
    return { conflict: { statements: trimStatements(statements) } };
  });
  await insertSource(ctx, card.id, fact, "conflict", traceOf(decision));
  return { id: card.id, visibility: "public", purge_after: result.purge_after, action: "conflict", reason: decision.reason };
}

function statementFromCard(card: Card, kind: "superseded" | "conflict"): ConflictStatement {
  return {
    kind,
    text: card.body.ja,
    title: card.title,
    body: card.body,
    status: card.facts?.status ?? null,
    valid_from: card.valid_from,
    valid_until: card.valid_until,
    source_type: card.source_type,
    official_confirmed: card.official_confirmed,
    source_count: card.source_count,
    submission_id: null,
    at: contentTime(card),
  };
}

function statementFromFact(fact: ExtractFact, submissionId: string, now: Date): ConflictStatement {
  return {
    kind: "conflict",
    text: fact.body.ja,
    title: fact.title,
    body: fact.body,
    status: fact.status,
    valid_from: fact.valid_from,
    valid_until: fact.valid_until,
    source_type: fact.source_type,
    official_confirmed: false,
    source_count: 1,
    submission_id: submissionId,
    at: now.toISOString(),
  };
}

/** Drops the oldest statements first, but never the first side of an open conflict. */
function trimStatements(statements: ConflictStatement[]): ConflictStatement[] {
  if (statements.length <= MAX_STATEMENTS) return statements;
  const firstConflict = statements.findIndex((s) => s.kind === "conflict");
  const rest = statements.filter((_, i) => i !== firstConflict).slice(-(MAX_STATEMENTS - 1));
  return firstConflict >= 0 ? [statements[firstConflict], ...rest] : statements.slice(-MAX_STATEMENTS);
}

/**
 * Read-modify-write guarded by updated_at, so two submissions touching the
 * same card cannot silently drop each other's statements. One retry on a
 * lost race, with the patch rebuilt from the fresh row.
 */
async function writeWithRetry(
  card: Card,
  build: (current: Card) => Record<string, unknown>,
): Promise<{ purge_after: string }> {
  let current = card;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db()
      .from("cards")
      .update(build(current))
      .eq("id", current.id)
      .eq("updated_at", current.updated_at)
      .select("purge_after");
    if (error) throw error;
    if (data && data.length > 0) return data[0] as { purge_after: string };
    const fresh = await getCard({ id: current.board_id }, current.id);
    if (!fresh) throw new Error(`card ${current.id} disappeared during reconcile`);
    current = fresh;
  }
  throw new Error(`card ${card.id} kept changing during reconcile`);
}

async function insertSource(
  ctx: SourceContext,
  cardId: string,
  fact: ExtractFact,
  relation: CardSource["relation"],
  trace: SourceTrace,
): Promise<void> {
  const { error } = await db().from("card_sources").insert({
    card_id: cardId,
    submission_id: ctx.sub.id,
    relation,
    source_type: fact.source_type,
    platform: ctx.platform,
    uploader_area_code: ctx.sub.uploader_area_code,
    reason: trace.reason,
    model: trace.model,
  });
  if (error) throw error;
}

function cardPurgeAfter(card: Card & { purge_after?: string | null }, now: Date): string {
  return card.purge_after ?? addDays(card.valid_until ?? now, CARD_RETENTION_DAYS);
}

function laterOf(a: string, b: string): string {
  return new Date(a) > new Date(b) ? a : b;
}

// --- reads and admin writes -----------------------------------------------------

/** Columns of a card_sources row that readers may see: no submission id, no uploader, no area. */
const TRACE_COLUMNS = "relation, source_type, platform, created_at, reason, model";

/**
 * How a public card was made: its card_sources rows oldest first, each with
 * the reconcile reason and the model that wrote it, plus whether the admin
 * confirmed the card. Nothing from the submissions themselves reaches the
 * reader: no content, no uploader, no image path. Null for held, hidden and
 * unknown cards, like the masked image route.
 */
export async function getPublicCardTrace(cardId: string): Promise<CardTrace | null> {
  const client = db();
  const { data: card, error } = await client
    .from("cards")
    .select("id, official_confirmed")
    .eq("id", cardId)
    .eq("visibility", "public")
    .maybeSingle();
  if (error) throw error;
  if (!card) return null;
  const { data, error: rowsErr } = await client
    .from("card_sources")
    .select(TRACE_COLUMNS)
    .eq("card_id", cardId)
    .order("created_at", { ascending: true });
  if (rowsErr) throw rowsErr;
  const steps = (data ?? []) as unknown as TraceStep[];
  return {
    card_id: cardId,
    official_confirmed: Boolean((card as { official_confirmed: boolean }).official_confirmed),
    steps,
    models: traceModels(steps),
  };
}

/**
 * Which models made the card, as far as the rows say: the `created` row's
 * model (the extract model) and the latest comparison row's model (the
 * reconcile model). A row written before migration 0005 has none, and no
 * comparison row means no reconcile model: nothing is named that is not on
 * record, not even a configured default.
 */
function traceModels(steps: TraceStep[]): CardTrace["models"] {
  const created = steps.find((s) => s.relation === "created");
  const compared = [...steps].reverse().find((s) => s.relation !== "created");
  return { extract: created?.model ?? null, reconcile: compared?.model ?? null };
}

/** Any card on the board, whatever its visibility. Server only. */
export async function getCard(board: Pick<Board, "id">, cardId: string): Promise<Card | null> {
  const { data, error } = await db()
    .from("cards")
    .select("*")
    .eq("board_id", board.id)
    .eq("id", cardId)
    .maybeSingle();
  if (error) throw error;
  return (data as Card | null) ?? null;
}
