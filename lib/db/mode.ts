import { db, hasDb } from "./client";
import type { WrittenCards } from "./submissions";
import {
  AUTO_RETURN_DAYS,
  EMERGENCY_CATEGORIES,
  autoReturnDue,
  reasonKind,
  switchesToDisaster,
  type ModeReason,
  type ModeView,
} from "@/lib/cards/mode";
import type { ExtractResult } from "@/lib/claude/extract";
import type { Board, BoardMode } from "@/lib/types";

/**
 * Board mode as a state (N21): reads and every write of `boards.mode`,
 * `mode_changed_at` and `mode_reason` (migration 0009). Three writers: the
 * admin switch, the official inbox (an emergency card switches a peace board
 * to disaster) and the auto return on the board page's load. Each write is
 * one conditional update on the mode it expects to replace, so two of them
 * racing change the board once. Each logs one line naming the board slug
 * and nothing else that identifies a row.
 *
 * Until migration 0009 is applied the reason column is missing: reads then
 * return no reason and writes store the mode and the time without one.
 */

/** The stored state. `reason` is the raw column (it carries a submission id) and stays on the server. */
export interface ModeState {
  mode: BoardMode;
  changedAt: string | null;
  reason: string | null;
}

type BoardRef = Pick<Board, "id" | "slug">;

/** Postgres undefined_column on a select, PostgREST's unknown column on a write. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export function toModeView(state: ModeState): ModeView {
  return { mode: state.mode, since: state.changedAt, reason: reasonKind(state.reason) };
}

export async function getModeState(board: Pick<Board, "id" | "mode">): Promise<ModeState> {
  if (!hasDb()) return { mode: board.mode, changedAt: null, reason: null };
  const read = (columns: string) => db().from("boards").select(columns).eq("id", board.id).maybeSingle();
  let { data, error } = await read("mode, mode_changed_at, mode_reason");
  if (isMissingColumn(error)) ({ data, error } = await read("mode, mode_changed_at"));
  if (error) throw error;
  const row = data as { mode: BoardMode; mode_changed_at: string | null; mode_reason?: string | null } | null;
  if (!row) return { mode: board.mode, changedAt: null, reason: null };
  return { mode: row.mode, changedAt: row.mode_changed_at, reason: row.mode_reason ?? null };
}

/**
 * Sets the mode to `to` only while the board is still in `from` (and, when
 * given, its mode last changed at `changedAt`). Null when the condition no
 * longer held: someone else switched it first, or it was already there.
 */
async function writeMode(
  board: BoardRef,
  to: BoardMode,
  reason: ModeReason,
  guard: { from: BoardMode; changedAt?: string | null },
  logDetail?: string,
): Promise<ModeState | null> {
  const changedAt = new Date().toISOString();
  const run = (patch: Record<string, unknown>) => {
    let query = db().from("boards").update(patch).eq("id", board.id).eq("mode", guard.from);
    if (guard.changedAt !== undefined) {
      query = guard.changedAt === null ? query.is("mode_changed_at", null) : query.eq("mode_changed_at", guard.changedAt);
    }
    return query.select("id");
  };
  let stored: string | null = reason;
  let { data, error } = await run({ mode: to, mode_changed_at: changedAt, mode_reason: reason });
  if (isMissingColumn(error)) {
    console.warn(`mode ${board.slug}: boards.mode_reason is missing (migration 0009), writing the mode without a reason`);
    stored = null;
    ({ data, error } = await run({ mode: to, mode_changed_at: changedAt }));
  }
  if (error) throw error;
  if (!data || data.length === 0) return null;
  console.log(`mode ${board.slug}: ${guard.from} to ${to} (${reasonKind(reason)}${logDetail ? `, ${logDetail}` : ""})`);
  return { mode: to, changedAt, reason: stored };
}

/**
 * The admin switch. Idempotent: the body names the mode wanted, so a second
 * tap or a stale page leaves a board that is already there as it is.
 */
export async function switchModeByAdmin(board: Board, to: BoardMode): Promise<{ state: ModeState; changed: boolean }> {
  const from: BoardMode = to === "disaster" ? "peace" : "disaster";
  const written = await writeMode(board, to, "admin", { from });
  if (written) return { state: written, changed: true };
  return { state: await getModeState(board), changed: false };
}

/**
 * The official inbox: after the cards of an inbox submission are written,
 * switches a peace board to disaster when one of its facts is an emergency
 * that went onto a public card (switchesToDisaster in lib/cards/mode.ts).
 * `written.decisions` has one entry per fact, in order. Never throws: the
 * mail's cards are on the board whatever happens to the mode.
 */
export async function switchOnFromInbox(
  board: Board,
  submissionId: string,
  result: Pick<ExtractResult, "facts" | "source_platform">,
  written: Pick<WrittenCards, "decisions" | "publicIds">,
): Promise<boolean> {
  try {
    let term: string | null = null;
    for (let i = 0; i < result.facts.length && !term; i++) {
      const decision = written.decisions[i];
      if (!decision) break;
      const visibility = written.publicIds.includes(decision.card_id) ? "public" : "held";
      term = switchesToDisaster(result.facts[i], result.source_platform, { action: decision.action, visibility });
    }
    if (!term) return false;
    return (await writeMode(board, "disaster", `inbox:${submissionId}`, { from: "peace" }, term)) !== null;
  } catch (err) {
    console.error(`mode ${board.slug}: switching on from the inbox failed:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * The auto return, checked when the board page loads: a board in disaster
 * whose mode last changed more than AUTO_RETURN_DAYS ago goes back to peace
 * when no public official card of an emergency category was created in that
 * time. The time guard comes first, so a board switched in the last seven
 * days (by the admin or the inbox) costs no query at all. Any failure leaves
 * the mode as it is.
 */
async function returnToPeaceIfQuiet(board: Board, state: ModeState, now: Date): Promise<ModeState> {
  if (!autoReturnDue({ mode: state.mode, since: state.changedAt }, now)) return state;
  try {
    const since = new Date(now.getTime() - AUTO_RETURN_DAYS * 86_400_000).toISOString();
    const { count, error } = await db()
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("board_id", board.id)
      .eq("visibility", "public")
      .eq("source_type", "official")
      .in("category", [...EMERGENCY_CATEGORIES])
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) > 0) return state;
    const written = await writeMode(board, "peace", "auto_return", { from: "disaster", changedAt: state.changedAt });
    return written ?? (await getModeState(board));
  } catch (err) {
    console.error(`mode ${board.slug}: auto return check failed:`, err instanceof Error ? err.message : String(err));
    return state;
  }
}

/**
 * The mode as readers get it, on the board page and in the 5 second poll.
 * A peace board needs no read beyond the board row the caller already has;
 * a disaster board reads when and why it changed (for the strip), and on
 * the page load only, checks the auto return. Never throws: a failed read
 * shows the mode without the strip's details.
 */
export async function modeForReaders(board: Board, options: { autoReturn?: boolean; now?: Date } = {}): Promise<ModeView> {
  const fallback: ModeView = { mode: board.mode, since: null, reason: null };
  if (!hasDb() || board.mode !== "disaster") return fallback;
  try {
    const state = await getModeState(board);
    return toModeView(options.autoReturn ? await returnToPeaceIfQuiet(board, state, options.now ?? new Date()) : state);
  } catch (err) {
    console.error(`mode ${board.slug}: reading the mode failed:`, err instanceof Error ? err.message : String(err));
    return fallback;
  }
}
