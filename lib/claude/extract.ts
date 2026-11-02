import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, extractModel, type ModelId } from "./client";
import { CATEGORIES, PLATFORMS, RISK_FLAGS, SOURCE_TYPES, CARD_STATUSES } from "@/lib/types";
import type { Board, Category, Multilingual, Platform, RiskFlag, SourceType, CardStatus } from "@/lib/types";
import { CARD_LANGS } from "@/lib/i18n";

// Prompt and schema are files, loaded once per process. Edit them there.
const PROMPT_PATH = join(process.cwd(), "lib/claude/prompts/extract.system.md");
const SCHEMA_PATH = join(process.cwd(), "lib/claude/schemas/extract.schema.json");

let systemPrompt: string | null = null;
let schema: Record<string, unknown> | null = null;

function loadPrompt(): string {
  systemPrompt ??= readFileSync(PROMPT_PATH, "utf8");
  return systemPrompt;
}

function loadSchema(): Record<string, unknown> {
  if (!schema) {
    const raw = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;
    // "$schema" is for editors; the API wants the schema body only.
    delete raw.$schema;
    schema = raw;
  }
  return schema;
}

export interface ExtractFact {
  category: Category;
  place_id: string | null;
  place_text_ja: string | null;
  status: CardStatus;
  valid_from: string | null;
  valid_until: string | null;
  conditions: string[];
  source_type: SourceType;
  risk_flags: RiskFlag[];
  confidence: "high" | "medium" | "low";
  title: Multilingual;
  body: Multilingual;
  original_excerpt: string;
}

export interface ExtractResult {
  input_language: string;
  source_platform: Platform;
  facts: ExtractFact[];
  discarded: string[];
  note_for_uploader: string | null;
}

export interface ExtractInput {
  image?: { data: string; mediaType: "image/jpeg" | "image/png" };
  text?: string;
}

export interface ExtractOutcome {
  result: ExtractResult;
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  stopReason: string | null;
  /** place ids the model returned that were not on the board and were set to null */
  droppedPlaceIds: string[];
}

export class ExtractError extends Error {
  constructor(
    public code: "refusal" | "invalid_output" | "pii_leak" | "truncated",
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

/** Board facts that rarely change, kept stable so the prompt cache hits. */
export function boardContext(board: Board): string {
  const places = board.known_places.map((p) => ({
    id: p.id,
    kind: p.kind,
    name_ja: p.name_ja,
    address_ja: p.address_ja ?? null,
    aliases: p.aliases,
    names: p.names,
  }));
  return [
    "## Board context",
    `Board: ${board.name.ja} (${board.name.en})`,
    `Mode: ${board.mode}`,
    "Known places (match place_id against these ids only):",
    JSON.stringify(places),
  ].join("\n");
}

/** Current time in Japan as ISO 8601 with the +09:00 offset. */
export function nowJst(now = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 3_600_000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

export async function extract(
  board: Board,
  input: ExtractInput,
  options: { model?: ModelId; now?: Date; maxTokens?: number } = {},
): Promise<ExtractOutcome> {
  if (!input.image && !input.text?.trim()) {
    throw new Error("extract needs an image or text");
  }
  const model = options.model ?? extractModel();
  const client = anthropic();

  const userContent: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType, data: input.image.data },
    });
  }
  const textParts = [`Current date and time in Japan: ${nowJst(options.now)}`];
  if (input.text?.trim()) {
    textParts.push("Input text:", input.text.trim());
  } else {
    textParts.push("Input: the attached image.");
  }
  userContent.push({ type: "text", text: textParts.join("\n\n") });

  const started = performance.now();
  const stream = client.messages.stream({
    model,
    max_tokens: options.maxTokens ?? 8000,
    system: [
      { type: "text", text: loadPrompt(), cache_control: { type: "ephemeral" } },
      { type: "text", text: boardContext(board), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: loadSchema() },
    },
  });
  const message = await stream.finalMessage();
  const latencyMs = Math.round(performance.now() - started);

  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };

  if (message.stop_reason === "refusal") {
    throw new ExtractError("refusal", message.stop_details?.explanation ?? "refused");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ExtractError("truncated", "output hit max_tokens");
  }
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExtractError("invalid_output", "response was not JSON");
  }
  const { result, droppedPlaceIds } = validateExtractResult(
    parsed,
    new Set(board.known_places.map((p) => p.id)),
  );
  return {
    result,
    model,
    latencyMs,
    usage,
    stopReason: message.stop_reason,
    droppedPlaceIds,
  };
}

// --- validation -----------------------------------------------------------

const PHONE_RE = /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|(?<!\d)0\d{9,10}(?!\d)/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function isMultilingual(v: unknown): v is Multilingual {
  return (
    typeof v === "object" &&
    v !== null &&
    CARD_LANGS.every((l) => typeof (v as Record<string, unknown>)[l] === "string")
  );
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Structural check on the model output plus the rules code owns: place ids
 * must exist on the board, and no phone number or email may survive in any
 * text field. Claude proposes; code decides.
 */
export function validateExtractResult(
  raw: unknown,
  knownPlaceIds: Set<string>,
): { result: ExtractResult; droppedPlaceIds: string[] } {
  if (typeof raw !== "object" || raw === null) {
    throw new ExtractError("invalid_output", "result is not an object");
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.facts)) throw new ExtractError("invalid_output", "facts missing");
  const droppedPlaceIds: string[] = [];
  const facts: ExtractFact[] = r.facts.map((f, i) => {
    if (typeof f !== "object" || f === null) {
      throw new ExtractError("invalid_output", `fact ${i} is not an object`);
    }
    const x = f as Record<string, unknown>;
    if (!oneOf(CATEGORIES, x.category)) throw new ExtractError("invalid_output", `fact ${i}: category`);
    if (!oneOf(SOURCE_TYPES, x.source_type)) throw new ExtractError("invalid_output", `fact ${i}: source_type`);
    if (!oneOf(CARD_STATUSES, x.status)) throw new ExtractError("invalid_output", `fact ${i}: status`);
    if (!isMultilingual(x.title) || !isMultilingual(x.body)) {
      throw new ExtractError("invalid_output", `fact ${i}: title or body languages`);
    }
    let placeId = stringOrNull(x.place_id);
    if (placeId && !knownPlaceIds.has(placeId)) {
      droppedPlaceIds.push(placeId);
      placeId = null;
    }
    const riskFlags = Array.isArray(x.risk_flags)
      ? x.risk_flags.filter((v): v is RiskFlag => oneOf(RISK_FLAGS, v))
      : [];
    const conditions = Array.isArray(x.conditions)
      ? x.conditions.filter((v): v is string => typeof v === "string")
      : [];
    const confidence = oneOf(["high", "medium", "low"] as const, x.confidence) ? x.confidence : "low";
    const fact: ExtractFact = {
      category: x.category,
      place_id: placeId,
      place_text_ja: stringOrNull(x.place_text_ja),
      status: x.status,
      valid_from: validIso(stringOrNull(x.valid_from)),
      valid_until: validIso(stringOrNull(x.valid_until)),
      conditions,
      source_type: x.source_type,
      risk_flags: riskFlags,
      confidence,
      title: x.title,
      body: x.body,
      original_excerpt: typeof x.original_excerpt === "string" ? x.original_excerpt : "",
    };
    for (const s of [
      ...Object.values(fact.title),
      ...Object.values(fact.body),
      fact.original_excerpt,
      fact.place_text_ja ?? "",
    ]) {
      if (PHONE_RE.test(s) || EMAIL_RE.test(s)) {
        throw new ExtractError("pii_leak", `fact ${i} contains a phone number or email`);
      }
    }
    return fact;
  });
  const result: ExtractResult = {
    input_language: typeof r.input_language === "string" ? r.input_language : "und",
    source_platform: oneOf(PLATFORMS, r.source_platform) ? r.source_platform : "unknown",
    facts,
    discarded: Array.isArray(r.discarded) ? r.discarded.filter((v): v is string => typeof v === "string") : [],
    note_for_uploader: stringOrNull(r.note_for_uploader),
  };
  return { result, droppedPlaceIds };
}

function validIso(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
