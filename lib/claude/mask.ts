import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, type ModelId } from "./client";

// Prompt and schema are files, loaded once per process. Edit them there.
const PROMPT_PATH = join(process.cwd(), "lib/claude/prompts/mask.system.md");
const SCHEMA_PATH = join(process.cwd(), "lib/claude/schemas/mask.schema.json");

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

/** Model used by mask. Overridable per environment while the eval decides. */
export function maskModel(): ModelId {
  return process.env.MASK_MODEL || MODELS.opus;
}

export const MASK_KINDS = ["avatar", "name", "handle", "phone", "room", "plate"] as const;
export type MaskKind = (typeof MASK_KINDS)[number];

/** Code never writes more boxes than this; a longer answer is rejected whole. */
export const MAX_MASK_BOXES = 60;

export interface MaskBox {
  kind: MaskKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MaskResult {
  /** The frame the boxes are in: the size the caller gave. */
  width: number;
  height: number;
  boxes: MaskBox[];
}

export interface MaskOutcome {
  result: MaskResult;
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  /** Boxes the model returned that were malformed or entirely outside the image. */
  dropped: number;
  /** Set when the model reported another frame size and the boxes were rescaled to the given one. */
  rescaledFrom: { width: number; height: number } | null;
}

export class MaskError extends Error {
  constructor(
    public code: "refusal" | "invalid_output" | "truncated" | "too_many_boxes",
    message: string,
  ) {
    super(message);
    this.name = "MaskError";
  }
}

export type MaskEffort = "low" | "medium" | "high";

/**
 * One structured-outputs vision call: where are the avatars, names, handles,
 * phone and room numbers in this screenshot. The image must already be the
 * exact size given in `size` (long edge at most 1568 px, see
 * lib/image/mask-pipeline.ts), so the model and the code agree on the frame.
 */
export async function maskBoxes(
  image: { data: string; mediaType: "image/jpeg" | "image/png" },
  size: { width: number; height: number },
  options: { model?: ModelId; effort?: MaskEffort } = {},
): Promise<MaskOutcome> {
  const model = options.model ?? maskModel();
  const userContent: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
    {
      type: "text",
      text:
        `The image is exactly ${size.width} pixels wide and ${size.height} pixels high. ` +
        "Return the boxes of every avatar, name, handle, phone number, room number and number plate in that frame.",
    },
  ];

  const started = performance.now();
  const message = await anthropic().messages.create({
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: loadPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
    output_config: {
      effort: options.effort ?? "medium",
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

  if (message.stop_reason === "refusal") {
    // Only the category: the explanation can quote what is in the screenshot.
    throw new MaskError("refusal", `refused (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new MaskError("truncated", "output hit max_tokens");
  }
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MaskError("invalid_output", "response was not JSON");
  }
  const { result, dropped, rescaledFrom } = validateMaskResult(parsed, size);
  return { result, model, latencyMs, usage, dropped, rescaledFrom };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Structural check plus the rules code owns: at most 60 boxes, every box
 * numeric and clipped to the image, boxes outside the image dropped. If the
 * model reports a frame other than the one it was given, its boxes are
 * scaled into the given frame. Claude proposes; code decides.
 */
export function validateMaskResult(
  raw: unknown,
  size: { width: number; height: number },
): { result: MaskResult; dropped: number; rescaledFrom: MaskOutcome["rescaledFrom"] } {
  if (typeof raw !== "object" || raw === null) throw new MaskError("invalid_output", "result is not an object");
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.boxes)) throw new MaskError("invalid_output", "boxes missing");
  if (r.boxes.length > MAX_MASK_BOXES) {
    throw new MaskError("too_many_boxes", `${r.boxes.length} boxes, at most ${MAX_MASK_BOXES} allowed`);
  }
  const reportedW = num(r.width);
  const reportedH = num(r.height);
  let sx = 1;
  let sy = 1;
  let rescaledFrom: MaskOutcome["rescaledFrom"] = null;
  if (reportedW && reportedH && reportedW > 0 && reportedH > 0 && (reportedW !== size.width || reportedH !== size.height)) {
    sx = size.width / reportedW;
    sy = size.height / reportedH;
    rescaledFrom = { width: reportedW, height: reportedH };
  }
  let dropped = 0;
  const boxes: MaskBox[] = [];
  for (const b of r.boxes) {
    if (typeof b !== "object" || b === null) {
      dropped++;
      continue;
    }
    const o = b as Record<string, unknown>;
    const kind = typeof o.kind === "string" && (MASK_KINDS as readonly string[]).includes(o.kind) ? (o.kind as MaskKind) : null;
    const x = num(o.x);
    const y = num(o.y);
    const w = num(o.w);
    const h = num(o.h);
    if (!kind || x === null || y === null || w === null || h === null) {
      dropped++;
      continue;
    }
    const x0 = Math.max(0, Math.floor(x * sx));
    const y0 = Math.max(0, Math.floor(y * sy));
    const x1 = Math.min(size.width, Math.ceil((x + w) * sx));
    const y1 = Math.min(size.height, Math.ceil((y + h) * sy));
    if (x1 <= x0 || y1 <= y0) {
      dropped++;
      continue;
    }
    boxes.push({
      kind,
      label: typeof o.label === "string" ? o.label.slice(0, 100) : "",
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    });
  }
  return { result: { width: size.width, height: size.height, boxes }, dropped, rescaledFrom };
}
