import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic, MODELS, type ModelId } from "./client";
import { boardContext, nowJst, type ExtractFact } from "./extract";
import { trustRank } from "@/lib/cards/trust";
import { RECONCILE_ACTIONS } from "@/lib/types";
import type { Board, CardStatus, ReconcileAction, SourceType } from "@/lib/types";

// Prompt and schema are files, loaded once per process. Edit them there.
const PROMPT_PATH = join(process.cwd(), "lib/claude/prompts/reconcile.system.md");
const SCHEMA_PATH = join(process.cwd(), "lib/claude/schemas/reconcile.schema.json");

let systemPrompt: string | null = null;
let schema: Record<string, unknown> | null = null;

function loadPrompt(): string {
  systemPrompt ??= readFileSync(PROMPT_PATH, "utf8");
  return systemPrompt;
}

function loadSchema(): Record<string, unknown> {
  if (!schema) {
    const raw = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;
    delete raw.$schema;
    schema = raw;
  }
  return schema;
}

/** Model used by reconcile. Overridable per environment while the eval decides. */
export function reconcileModel(): ModelId {
  return process.env.RECONCILE_MODEL || MODELS.opus;
}

/** A candidate card as the model sees it: the compact fields listed in lib/claude/README.md. */
export interface ReconcileCandidate {
  id: string;
  place_id: string | null;
  place_text_ja: string | null;
  status: CardStatus | null;
  valid_from: string | null;
  valid_until: string | null;
  conditions: string[];
  source_type: SourceType;
  official_confirmed: boolean;
  source_count: number;
  title_ja: string;
  created_at: string;
  updated_at: string;
}

export interface ReconcileDecision {
  action: ReconcileAction;
  /** Null exactly when action is create. */
  target_card_id: string | null;
  fill_missing: boolean;
  reason: string;
}

export interface ReconcileOutcome {
  decision: ReconcileDecision;
  /** What the model proposed, before code checked it. Null when no call was made. */
  proposed: ReconcileDecision | null;
  /** Why code changed the proposal, if it did. */
  override: string | null;
  model: string | null;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function jst(iso: string | null): string | null {
  return iso ? nowJst(new Date(iso)) : null;
}

/** The new fact in the shape the prompt describes, times in JST. */
function compactFact(fact: ExtractFact) {
  return {
    category: fact.category,
    place_id: fact.place_id,
    place_text_ja: fact.place_text_ja,
    status: fact.status,
    valid_from: jst(fact.valid_from),
    valid_until: jst(fact.valid_until),
    conditions: fact.conditions,
    source_type: fact.source_type,
    title_ja: fact.title.ja,
    title_en: fact.title.en,
    original_excerpt: fact.original_excerpt,
  };
}

function compactCandidate(c: ReconcileCandidate) {
  return {
    ...c,
    valid_from: jst(c.valid_from),
    valid_until: jst(c.valid_until),
    created_at: jst(c.created_at),
    updated_at: jst(c.updated_at),
  };
}

/**
 * Decides what a new fact does to the board. One structured-outputs call over
 * candidates code already selected; code then checks the answer. With no
 * candidates there is nothing to compare, so no call is made.
 */
export async function reconcile(
  board: Board,
  fact: ExtractFact,
  candidates: ReconcileCandidate[],
  options: { model?: ModelId; now?: Date } = {},
): Promise<ReconcileOutcome> {
  if (candidates.length === 0) {
    return {
      decision: { action: "create", target_card_id: null, fill_missing: false, reason: "no candidates" },
      proposed: null,
      override: null,
      model: null,
      latencyMs: 0,
      usage: NO_USAGE,
    };
  }
  const model = options.model ?? reconcileModel();
  const userText = [
    `Current date and time in Japan: ${nowJst(options.now)}`,
    "New fact:",
    JSON.stringify(compactFact(fact)),
    `Candidate cards (${candidates.length}):`,
    JSON.stringify(candidates.map(compactCandidate)),
  ].join("\n\n");

  const started = performance.now();
  const message = await anthropic().messages.create({
    model,
    max_tokens: 4000,
    system: [
      { type: "text", text: loadPrompt(), cache_control: { type: "ephemeral" } },
      { type: "text", text: boardContext(board), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userText }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: loadSchema() },
    },
  });
  const latencyMs = Math.round(performance.now() - started);
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };

  let proposed: ReconcileDecision | null = null;
  if (message.stop_reason === "end_turn") {
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    try {
      proposed = parseDecision(JSON.parse(text));
    } catch {
      proposed = null;
    }
  }
  const { decision, override } = proposed
    ? checkDecision(proposed, fact, candidates)
    : {
        decision: createDecision(`no usable output (stop_reason ${message.stop_reason})`),
        override: `stop_reason ${message.stop_reason} or invalid JSON`,
      };
  if (override) {
    console.warn(`reconcile override: ${override}`, JSON.stringify(proposed));
  }
  return { decision, proposed, override, model, latencyMs, usage };
}

function createDecision(reason: string): ReconcileDecision {
  return { action: "create", target_card_id: null, fill_missing: false, reason };
}

function parseDecision(raw: unknown): ReconcileDecision | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.action !== "string" || !(RECONCILE_ACTIONS as readonly string[]).includes(r.action)) return null;
  return {
    action: r.action as ReconcileAction,
    target_card_id: typeof r.target_card_id === "string" ? r.target_card_id : null,
    fill_missing: r.fill_missing === true,
    reason: typeof r.reason === "string" ? r.reason.slice(0, 500) : "",
  };
}

/**
 * Claude proposes; code decides. The target must be one of the candidates,
 * and the trust order is enforced here, not left to the prompt: a weaker
 * source never overwrites a stronger one, so such an update becomes a
 * conflict (an old official statement against a new secondhand one is a
 * conflict, not an overwrite).
 */
export function checkDecision(
  proposed: ReconcileDecision,
  fact: ExtractFact,
  candidates: ReconcileCandidate[],
): { decision: ReconcileDecision; override: string | null } {
  if (proposed.action === "create") {
    return { decision: { ...proposed, target_card_id: null, fill_missing: false }, override: null };
  }
  if (proposed.action === "hold") {
    // A hold inserts a new held card; a target, if any, is only context for the admin.
    const known = candidates.some((c) => c.id === proposed.target_card_id);
    return { decision: { ...proposed, target_card_id: known ? proposed.target_card_id : null }, override: null };
  }
  const target = candidates.find((c) => c.id === proposed.target_card_id);
  if (!target) {
    return {
      decision: createDecision(`target ${proposed.target_card_id ?? "null"} not in candidates`),
      override: `${proposed.action} with a target outside the candidate list`,
    };
  }
  if (proposed.action === "update") {
    const newRank = trustRank(fact.source_type);
    const oldRank = trustRank(target.source_type, target.official_confirmed);
    if (newRank < oldRank) {
      return {
        decision: { ...proposed, action: "conflict", fill_missing: false },
        override: `update from ${fact.source_type} over ${target.official_confirmed ? "confirmed " : ""}${target.source_type} downgraded to conflict`,
      };
    }
  }
  return {
    decision: { ...proposed, fill_missing: proposed.action === "merge" && proposed.fill_missing },
    override: null,
  };
}
