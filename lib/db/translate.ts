import { db } from "./client";
import { missingLangs } from "@/lib/cards/langs";
import {
  isTranslateLang,
  mergeTargets,
  translate,
  TRANSLATE_LANGS,
  type TranslateItem,
  type TranslateLang,
  type TranslateOutcome,
} from "@/lib/claude/translate";
import type { Board, ConflictStatement, PartialMultilingual } from "@/lib/types";

/**
 * Fills the languages stored cards still lack. Extract writes Japanese,
 * English and the input's language; this step adds the rest after the card
 * is already on the board. It works on the rows, not on the extract result,
 * so a merge target that already has six languages is left alone (no field
 * is ever overwritten, and a card that lacks nothing causes no call), and so
 * that a card whose translation failed earlier can be picked up by any later
 * drop-in on the board (`listCardsMissingLanguages`).
 */

/** The columns this step reads and writes. */
interface TextRow {
  id: string;
  title: PartialMultilingual;
  body: PartialMultilingual;
  conflict: { statements: ConflictStatement[] } | null;
  updated_at: string;
}

const TEXT_COLUMNS = "id, title, body, conflict, updated_at";

/** One piece of text on a card: the card itself (`statement` null) or one of its conflict statements. */
interface Slot {
  cardId: string;
  statement: number | null;
  title: PartialMultilingual;
  body: PartialMultilingual;
}

/** The Claude call, injectable so the process route can wrap it in the budget guard. */
export type TranslateFn = (items: TranslateItem[], langs: readonly TranslateLang[]) => Promise<TranslateOutcome>;

export interface FillOutcome {
  /** Cards that received at least one language. */
  filled: string[];
  /** Cards whose row changed under us and were left for the next pass. */
  skipped: string[];
  langs: TranslateLang[];
  model: string;
  latencyMs: number;
  usage: TranslateOutcome["usage"];
}

function slotsOf(row: TextRow): Slot[] {
  const slots: Slot[] = [];
  if (needsTranslate(row.title, row.body)) slots.push({ cardId: row.id, statement: null, title: row.title, body: row.body });
  row.conflict?.statements.forEach((s, i) => {
    if (s.title && s.body && needsTranslate(s.title, s.body)) {
      slots.push({ cardId: row.id, statement: i, title: s.title, body: s.body });
    }
  });
  return slots;
}

/** True when a language translate can write is missing. A text without ja or en cannot be helped here. */
function needsTranslate(title: PartialMultilingual, body: PartialMultilingual): boolean {
  return title.ja?.trim() && title.en?.trim() && body.ja?.trim() && body.en?.trim()
    ? missingLangs(title, body).some(isTranslateLang)
    : false;
}

async function readRows(ids: string[]): Promise<TextRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db().from("cards").select(TEXT_COLUMNS).in("id", ids);
  if (error) throw error;
  return (data ?? []) as TextRow[];
}

/**
 * Cards on the board that still lack a language, newest first, at most
 * `limit`, leaving out `exclude`. Public cards and hidden duplicates (which
 * the drawer shows) only: a held card waits for the admin and is the likeliest
 * to make the model refuse, and a plain hidden card is read by no one. The
 * rows are filtered in code; a board has few cards and the check is on JSON
 * keys.
 */
export async function listCardsMissingLanguages(boardId: string, limit: number, exclude: string[] = []): Promise<string[]> {
  const { data, error } = await db()
    .from("cards")
    .select(TEXT_COLUMNS)
    .eq("board_id", boardId)
    .or("visibility.eq.public,and(visibility.eq.hidden,duplicate_of.not.is.null)")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as TextRow[])
    .filter((r) => !exclude.includes(r.id) && slotsOf(r).length > 0)
    .slice(0, limit)
    .map((r) => r.id);
}

/** Among the given cards, whatever their visibility, the ones that still lack a language translate can write. */
export async function cardsStillMissing(ids: string[]): Promise<string[]> {
  return (await readRows(ids)).filter((r) => slotsOf(r).length > 0).map((r) => r.id);
}

/**
 * One translate call for every missing language of the given cards, then
 * one guarded update per card: only the languages that were missing are
 * written, under the `updated_at` the row had when it was read. A row that
 * changed meanwhile (an update replaced its text) is read again and filled
 * only if its Japanese and English are still the ones that were translated;
 * otherwise it is skipped and the next pass picks it up. Returns null when
 * nothing was missing, in which case no call was made.
 */
export async function fillCardLanguages(
  board: Board,
  cardIds: string[],
  options: { translator?: TranslateFn } = {},
): Promise<FillOutcome | null> {
  const rows = await readRows(cardIds);
  const slots = rows.flatMap(slotsOf);
  if (slots.length === 0) return null;
  const langs = TRANSLATE_LANGS.filter((l) => slots.some((s) => missingLangs(s.title, s.body).includes(l)));
  const call = options.translator ?? ((items, wanted) => translate(board, items, wanted));
  const outcome = await call(
    slots.map((s) => ({ title: { ja: s.title.ja, en: s.title.en }, body: { ja: s.body.ja, en: s.body.en } })),
    langs,
  );

  const filled: string[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const own = slots.map((s, i) => [s, i] as const).filter(([s]) => s.cardId === row.id);
    if (own.length === 0) continue;
    const ok = await patchRow(row, own.map(([s, i]) => ({ slot: s, targets: outcome.items[i] })));
    (ok ? filled : skipped).push(row.id);
  }
  return { filled, skipped, langs, model: outcome.model, latencyMs: outcome.latencyMs, usage: outcome.usage };
}

type Patch = { slot: Slot; targets: TranslateOutcome["items"][number] };

/** Writes the translations into one row; one retry on a lost race, applied only if the text is unchanged. */
async function patchRow(row: TextRow, patches: Patch[]): Promise<boolean> {
  let current = row;
  for (let attempt = 0; attempt < 2; attempt++) {
    const update = buildUpdate(current, patches);
    if (!update) return false;
    const { data, error } = await db()
      .from("cards")
      .update(update)
      .eq("id", current.id)
      .eq("updated_at", current.updated_at)
      .select("id");
    if (error) throw error;
    if (data && data.length > 0) return true;
    const fresh = (await readRows([current.id]))[0];
    if (!fresh) return false;
    current = fresh;
  }
  return false;
}

/** The update for a row, or null when the text it holds is no longer the text that was translated. */
function buildUpdate(row: TextRow, patches: Patch[]): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};
  let statements = row.conflict?.statements;
  for (const { slot, targets } of patches) {
    if (slot.statement === null) {
      if (!sameSource(row.title, row.body, slot)) return null;
      update.title = mergeTargets(row.title, targets.title);
      update.body = mergeTargets(row.body, targets.body);
    } else {
      const s = statements?.[slot.statement];
      if (!s?.title || !s.body || !sameSource(s.title, s.body, slot)) continue;
      statements = statements!.map((st, i) =>
        i === slot.statement ? { ...st, title: mergeTargets(st.title!, targets.title), body: mergeTargets(st.body!, targets.body) } : st,
      );
      update.conflict = { ...row.conflict, statements };
    }
  }
  return Object.keys(update).length ? update : null;
}

function sameSource(title: PartialMultilingual, body: PartialMultilingual, slot: Slot): boolean {
  return title.ja === slot.title.ja && title.en === slot.title.en && body.ja === slot.body.ja && body.en === slot.body.en;
}
