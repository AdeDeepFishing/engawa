import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, type ModelId } from "./client";
import { nowJst } from "./extract";
import { isExpired } from "@/lib/cards/categories";
import { conflictStatements, placeLabel, statementText } from "@/lib/cards/display";
import { t, type Lang } from "@/lib/i18n";
import type { Board, Card, SourceType } from "@/lib/types";

// Prompt is a file, loaded once per process. Edit it there.
const PROMPT_PATH = join(process.cwd(), "lib/claude/prompts/ask.system.md");

let systemPrompt: string | null = null;

function loadPrompt(): string {
  systemPrompt ??= readFileSync(PROMPT_PATH, "utf8");
  return systemPrompt;
}

/** Model used by ask. Sonnet first for speed; ASK_MODEL switches per environment. */
export function askModel(): ModelId {
  return process.env.ASK_MODEL || MODELS.sonnet;
}

export const MAX_QUESTION_CHARS = 500;

/** A run of answer text and the cards it cites (empty when the run cites nothing). */
export interface AskSegment {
  text: string;
  cardIds: string[];
}

export interface AskAnswer {
  segments: AskSegment[];
  /** Every cited card once, in order of first citation. */
  cardIds: string[];
  /** True when code answered "no information yet" without calling Claude. */
  noInfo: boolean;
}

export interface AskOutcome {
  answer: AskAnswer;
  /** null when Claude was not called. */
  model: string | null;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  stopReason: string | null;
}

export class AskError extends Error {
  constructor(
    public code: "refusal" | "truncated" | "empty",
    message: string,
  ) {
    super(message);
    this.name = "AskError";
  }
}

const LANG_NAME: Record<Lang, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Simplified Chinese",
  ko: "Korean",
  vi: "Vietnamese",
};

const SOURCE_LABEL: Record<SourceType, string> = {
  official: "official notice",
  firsthand: "seen firsthand",
  secondhand: "heard from others",
  unknown: "unknown",
};

const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** "2026-11-03 14:00" in Japan time. */
function jst(iso: string): string {
  return nowJst(new Date(iso)).slice(0, 16).replace("T", " ");
}

/** The answer when the board has nothing to go on, in the reader's language. */
export function noInformationAnswer(lang: Lang): AskAnswer {
  return { segments: [{ text: t("ask.no_info", lang), cardIds: [] }], cardIds: [], noInfo: true };
}

/**
 * One citable document per card. Title is the card title in the reader's
 * language; the content is the body in that language followed by the facts
 * a reader needs to judge it (source, confirmation, age, expiry) and, when
 * sources disagree, every conflicting statement with its source and time,
 * so the answer can give both sides instead of only the card text.
 */
export function cardDocument(card: Card, board: Board, lang: Lang, now: Date): Anthropic.DocumentBlockParam {
  const lines = [card.body[lang] || card.body.ja, "", `Japanese title: ${card.title.ja}`];
  const place = placeLabel(card, board, lang);
  if (place) lines.push(`Place: ${place}`);
  if (card.facts?.status && card.facts.status !== "unknown") lines.push(`Status: ${card.facts.status}`);
  lines.push(`Source type: ${SOURCE_LABEL[card.source_type]}`);
  lines.push(`Confirmed as official by an admin: ${card.official_confirmed ? "yes" : "no"}`);
  lines.push(`Number of sources: ${card.source_count}`);
  lines.push(`Posted: ${jst(card.created_at)}`);
  if (card.valid_from) lines.push(`Valid from: ${jst(card.valid_from)}`);
  if (card.valid_until) lines.push(`Valid until: ${jst(card.valid_until)}`);
  if (isExpired(card.valid_until, now)) lines.push("Possibly outdated: the valid until time has passed.");
  const conflicts = conflictStatements(card);
  if (conflicts.length) {
    lines.push(
      "",
      "Conflicting reports: sources disagree about this card. The card text above is the statement that stands; the statements below, which include it, contradict each other:",
    );
    for (const s of conflicts) {
      const about = [
        `source type: ${SOURCE_LABEL[s.source_type]}`,
        s.official_confirmed ? "confirmed as official by an admin" : null,
        `posted: ${jst(s.at)}`,
      ].filter(Boolean);
      lines.push(`- ${statementText(s, lang)} (${about.join(", ")})`);
    }
  }
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: lines.join("\n") },
    title: card.title[lang] || card.title.ja,
    citations: { enabled: true },
  };
}

/** UI copy has no em or en dashes; ranges between numbers keep a plain hyphen. */
function noDashes(text: string): string {
  return text.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2").replace(/\s*[\u2013\u2014]\s*/g, ", ");
}

/**
 * Answers a question from the board's public cards with the Citations API.
 * Questions are never stored or logged; only the usage counter moves (the
 * caller wraps this in withUsage). With no cards, code answers without Claude.
 */
export async function ask(
  board: Board,
  cards: Card[],
  question: string,
  lang: Lang,
  options: { model?: ModelId; now?: Date } = {},
): Promise<AskOutcome> {
  const q = question.trim();
  if (!q) throw new Error("ask needs a question");
  if (cards.length === 0) {
    return { answer: noInformationAnswer(lang), model: null, latencyMs: 0, usage: NO_USAGE, stopReason: null };
  }
  const now = options.now ?? new Date();
  const model = options.model ?? askModel();

  // Ordered by id so the document prefix is stable and the prompt cache hits
  // until a card is added, changed or expires.
  const ordered = [...cards].sort((a, b) => a.id.localeCompare(b.id));
  const documents = ordered.map((c) => cardDocument(c, board, lang, now));
  documents[documents.length - 1] = {
    ...documents[documents.length - 1],
    cache_control: { type: "ephemeral" },
  };

  const started = performance.now();
  const message = await anthropic().messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: "text", text: loadPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          ...documents,
          {
            type: "text",
            text: [
              `Reader's interface language: ${LANG_NAME[lang]}`,
              `Current date and time in Japan: ${nowJst(now)}`,
              "",
              "Question:",
              q.slice(0, MAX_QUESTION_CHARS),
            ].join("\n"),
          },
        ],
      },
    ],
    output_config: { effort: "low" },
  });
  const latencyMs = Math.round(performance.now() - started);
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };

  if (message.stop_reason === "refusal") {
    throw new AskError("refusal", message.stop_details?.explanation ?? "refused");
  }
  if (message.stop_reason === "max_tokens") throw new AskError("truncated", "output hit max_tokens");

  // Claude proposes the citations; code maps each document index back to a
  // card id and drops anything that does not point at a card it was given.
  const segments: AskSegment[] = [];
  const cited: string[] = [];
  for (const block of message.content) {
    if (block.type !== "text") continue;
    const ids: string[] = [];
    for (const c of block.citations ?? []) {
      if (!("document_index" in c)) continue;
      const card = ordered[c.document_index];
      if (!card) continue;
      if (!ids.includes(card.id)) ids.push(card.id);
      if (!cited.includes(card.id)) cited.push(card.id);
    }
    segments.push({ text: noDashes(block.text), cardIds: ids });
  }
  if (!segments.some((s) => s.text.trim())) throw new AskError("empty", "no text in the answer");

  return {
    answer: { segments, cardIds: cited, noInfo: false },
    model,
    latencyMs,
    usage,
    stopReason: message.stop_reason,
  };
}
