import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

/** Server-only Anthropic client. Reads ANTHROPIC_API_KEY from the environment. */
export function anthropic(): Anthropic {
  if (typeof window !== "undefined") {
    throw new Error("The Claude client must not be used in the browser");
  }
  cached ??= new Anthropic({ maxRetries: 2, timeout: 240_000 });
  return cached;
}

export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS] | (string & {});

/** Model used by extract. Overridable per environment while the eval decides. */
export function extractModel(): ModelId {
  return process.env.EXTRACT_MODEL || MODELS.opus;
}
