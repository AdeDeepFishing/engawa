import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic, MODELS, type ModelId } from "./client";
import type { UsageMeter } from "./usage";
import { boardContext, containsContact, type ExtractFact } from "./extract";
import { missingLangs } from "@/lib/cards/langs";
import type { CardLang } from "@/lib/i18n";
import type { Board, PartialMultilingual } from "@/lib/types";

// Prompt and schema are files, loaded once per process. Edit them there.
const PROMPT_PATH = join(process.cwd(), "lib/claude/prompts/translate.system.md");
const SCHEMA_PATH = join(process.cwd(), "lib/claude/schemas/translate.schema.json");

/** Languages translate writes: everything extract does not always write. */
export const TRANSLATE_LANGS = ["zh", "ko", "vi", "easy_ja"] as const satisfies readonly CardLang[];
export type TranslateLang = (typeof TRANSLATE_LANGS)[number];

export function isTranslateLang(v: unknown): v is TranslateLang {
  return typeof v === "string" && (TRANSLATE_LANGS as readonly string[]).includes(v);
}

let systemPrompt: string | null = null;
let fullSchema: Record<string, unknown> | null = null;
const schemaByLangs = new Map<string, Record<string, unknown>>();

function loadPrompt(): string {
  systemPrompt ??= readFileSync(PROMPT_PATH, "utf8");
  return systemPrompt;
}

/**
 * The schema file lists every language translate can write. A call asks
 * for a subset (a Chinese input already has Chinese), so `targets` is cut
 * down to those: the model then writes exactly the languages asked for,
 * and the shape is still validated by the API. One variant per subset,
 * built once per process.
 */
function schemaFor(langs: readonly TranslateLang[]): Record<string, unknown> {
  const key = langs.join(",");
  const cached = schemaByLangs.get(key);
  if (cached) return cached;
  if (!fullSchema) {
    fullSchema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;
    // "$schema" and "description" are for editors; the API wants the schema body only.
    delete fullSchema.$schema;
    delete fullSchema.description;
  }
  const schema = structuredClone(fullSchema);
  const targets = (schema.$defs as { targets: { required: string[]; properties: Record<string, unknown> } }).targets;
  targets.required = [...langs];
  targets.properties = Object.fromEntries(langs.map((l) => [l, targets.properties[l]]));
  schemaByLangs.set(key, schema);
  return schema;
}

/** Model used by translate. Overridable per environment; the measurement is in docs/DEVLOG.md. */
export function translateModel(): ModelId {
  return process.env.TRANSLATE_MODEL || MODELS.opus;
}

/** One piece of text to translate: the Japanese and English the extract step wrote. */
export interface TranslateItem {
  title: { ja: string; en: string };
  body: { ja: string; en: string };
}

export type TranslateTargets = Partial<Record<TranslateLang, string>>;

export interface TranslateOutcome {
  /** One entry per input item, in order, holding exactly the languages asked for. */
  items: { title: TranslateTargets; body: TranslateTargets }[];
  langs: TranslateLang[];
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  stopReason: string | null;
}

export class TranslateError extends Error {
  constructor(
    public code: "refusal" | "invalid_output" | "pii_leak" | "truncated",
    message: string,
  ) {
    super(message);
    this.name = "TranslateError";
  }
}

/**
 * Translates card titles and bodies from Japanese and English into the
 * languages asked for. One structured-outputs call for every item of a
 * submission (and, in the process route, a few older cards still waiting).
 * The system prompt and the board context (known places with their names
 * in each language) are cached; the languages and the items are the user
 * turn. With no items or no languages there is no call.
 */
export async function translate(
  board: Board,
  items: TranslateItem[],
  langs: readonly TranslateLang[],
  options: { model?: ModelId; maxTokens?: number; onUsage?: UsageMeter } = {},
): Promise<TranslateOutcome> {
  const wanted = TRANSLATE_LANGS.filter((l) => langs.includes(l));
  if (items.length === 0 || wanted.length === 0) {
    throw new Error("translate needs at least one item and one language");
  }
  const model = options.model ?? translateModel();
  const userText = [
    `Languages to write: ${wanted.join(", ")}`,
    "Items:",
    JSON.stringify(
      items.map((it, index) => ({
        index,
        title_ja: it.title.ja,
        title_en: it.title.en,
        body_ja: it.body.ja,
        body_en: it.body.en,
      })),
    ),
  ].join("\n\n");

  const started = performance.now();
  const message = await anthropic().messages.create({
    model,
    max_tokens: options.maxTokens ?? 8000,
    system: [
      { type: "text", text: loadPrompt(), cache_control: { type: "ephemeral" } },
      { type: "text", text: boardContext(board), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: schemaFor(wanted) },
    },
  });
  const latencyMs = Math.round(performance.now() - started);
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
  options.onUsage?.(usage);
  if (message.stop_reason === "refusal") {
    throw new TranslateError("refusal", message.stop_details?.explanation ?? "refused");
  }
  if (message.stop_reason === "max_tokens") throw new TranslateError("truncated", "output hit max_tokens");
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TranslateError("invalid_output", "response was not JSON");
  }
  return {
    items: validateTranslateResult(parsed, items.length, wanted),
    langs: wanted,
    model,
    latencyMs,
    usage,
    stopReason: message.stop_reason,
  };
}

/**
 * Structural check plus the rules code owns: one entry per item, every
 * asked-for language a non-empty string, and no phone number or email in
 * any of them (the source text passed the same check, so one here would be
 * the model's own addition). Claude proposes; code decides.
 */
export function validateTranslateResult(
  raw: unknown,
  count: number,
  langs: readonly TranslateLang[],
): TranslateOutcome["items"] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { items?: unknown }).items)) {
    throw new TranslateError("invalid_output", "items missing");
  }
  const byIndex = new Map<number, { title: TranslateTargets; body: TranslateTargets }>();
  for (const entry of (raw as { items: unknown[] }).items) {
    if (typeof entry !== "object" || entry === null) throw new TranslateError("invalid_output", "item is not an object");
    const e = entry as Record<string, unknown>;
    const index = typeof e.index === "number" ? e.index : -1;
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new TranslateError("invalid_output", `item index ${String(e.index)} out of range`);
    }
    byIndex.set(index, { title: targetsOf(e.title, langs, `item ${index} title`), body: targetsOf(e.body, langs, `item ${index} body`) });
  }
  const out: TranslateOutcome["items"] = [];
  for (let i = 0; i < count; i++) {
    const item = byIndex.get(i);
    if (!item) throw new TranslateError("invalid_output", `item ${i} missing`);
    out.push(item);
  }
  return out;
}

function targetsOf(v: unknown, langs: readonly TranslateLang[], where: string): TranslateTargets {
  if (typeof v !== "object" || v === null) throw new TranslateError("invalid_output", `${where} is not an object`);
  const out: TranslateTargets = {};
  for (const l of langs) {
    const s = (v as Record<string, unknown>)[l];
    if (typeof s !== "string" || !s.trim()) throw new TranslateError("invalid_output", `${where} lacks ${l}`);
    if (containsContact(s)) throw new TranslateError("pii_leak", `${where}.${l} contains a phone number or email`);
    out[l] = s;
  }
  return out;
}

/** The languages a set of facts still needs from translate: the union of what each one lacks. */
export function langsToTranslate(facts: readonly Pick<ExtractFact, "title" | "body">[]): TranslateLang[] {
  const missing = new Set<string>();
  for (const f of facts) for (const l of missingLangs(f.title, f.body)) missing.add(l);
  return TRANSLATE_LANGS.filter((l) => missing.has(l));
}

/** `m` with the translations added for the languages it lacked; existing text is never replaced. */
export function mergeTargets(m: PartialMultilingual, targets: TranslateTargets): PartialMultilingual {
  const out: PartialMultilingual = { ...m };
  for (const l of TRANSLATE_LANGS) {
    const v = targets[l];
    if (v && !(typeof out[l] === "string" && out[l].trim())) out[l] = v;
  }
  return out;
}

export interface TranslatedFacts {
  facts: ExtractFact[];
  /** Null when every fact already had all six languages, so no call was made. */
  outcome: TranslateOutcome | null;
  latencyMs: number;
}

/**
 * Extract facts with the languages they lack filled in by one translate
 * call. The eval and the latency script use this; the process route works
 * on the stored cards instead (lib/db/translate.ts) so a merge target that
 * already has six languages is left alone.
 */
export async function translateFacts(
  board: Board,
  facts: ExtractFact[],
  options: { model?: ModelId } = {},
): Promise<TranslatedFacts> {
  const langs = langsToTranslate(facts);
  if (facts.length === 0 || langs.length === 0) return { facts, outcome: null, latencyMs: 0 };
  const outcome = await translate(
    board,
    facts.map((f) => ({ title: { ja: f.title.ja, en: f.title.en }, body: { ja: f.body.ja, en: f.body.en } })),
    langs,
    options,
  );
  return {
    facts: facts.map((f, i) => ({
      ...f,
      title: mergeTargets(f.title, outcome.items[i].title),
      body: mergeTargets(f.body, outcome.items[i].body),
    })),
    outcome,
    latencyMs: outcome.latencyMs,
  };
}
