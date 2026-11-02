# Development log

One entry per working day. What Claude Code did, which model did what, and what needed a human decision. This log is the source for the "how we used Claude" section of the README and the submission form.

## 2026-11-02 (Sun), kickoff day, evening session

**Model:** `claude-fable-5-1` in Claude Code, planning role.

**Done**
- Read the pre-event planning notes (kept outside the repo) and reviewed them critically: scope versus time, logical holes, judge questions.
- Created this private repository after the 12:00 JST kickoff and committed the `create-next-app` scaffold (Next.js 16, React 19, Tailwind 4, pnpm).
- Wrote `CLAUDE.md`, `docs/PLAN.md` (scope, architecture decisions, day-by-day task board), `docs/PRIVACY.md` (retention table), `.env.example`.
- Wrote the initial database migration (`supabase/migrations/0001_init.sql`) and seed drafts for the 武蔵小杉 board.
- Wrote the Claude prompts (`lib/claude/prompts/`) and JSON schemas (`lib/claude/schemas/`) for extract, translate, reconcile and ask.

**Decisions made today (human)**
- Product name: Engawa (縁側).
- Hosting: Cloudflare Workers was the first choice, revised the same evening to Vercel Hobby. The Workers free plan allows 10 ms of CPU per request, too tight for server rendering, and there is no budget for the paid plan. Vercel Hobby covers 300 second functions and a daily cron for free.
- No alert or early-warning features. The board starts where alerts stop.
- Pilot board: 武蔵小杉 (中原区, 川崎市).
- Reconcile is a single structured call over code-selected candidates, not an agent loop.
- Minimal admin page and the purge job are in the must list; pink masking of screenshots is a time-boxed experiment at the end.
- Area badge is "self-reported area", never "verified".
- Implementation from tomorrow runs on `claude-opus-5-5`; Fable returns for prompt tuning and the 11/6 review.

**Also done**
- Verified the shelters for the board against the city's designated shelter list (資料編 2-06, as of 2025-04-01) and the emergency water points (2-18), read from the city's PDFs. 小杉小学校 (opened 2019) is the designated shelter for 小杉町2丁目 and 3丁目 and becomes the demo shelter. Seed updated with addresses and target areas.

**Open for the human**
- Supabase project and keys, Anthropic API key, Vercel project from the GitHub repo.
- Fixture inputs with fake names and avatars.
