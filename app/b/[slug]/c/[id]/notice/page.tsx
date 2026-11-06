import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/b/[slug]/poster/PrintButton";
import { encodeQr, qrPath } from "@/components/share/qr";
import { appBase } from "@/lib/app-url";
import { isExpired } from "@/lib/cards/categories";
import { formatFullDateTime, placeLabel, timeRange } from "@/lib/cards/display";
import { cardPath } from "@/lib/cards/share";
import { traceInputKey } from "@/lib/cards/trace";
import { loadPublicCard } from "@/lib/db/public-card";
import { LANGS, t, tCount, type CardLang, type Lang } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import type { Board, Card } from "@/lib/types";

type Props = { params: Promise<{ slug: string; id: string }> };

const QR_MARGIN = 4;
/** Japanese first because the paper hangs in Japan, easy Japanese next to it, then the other languages. */
const NOTICE_LANGS: CardLang[] = ["ja", "easy_ja", "en", "zh", "ko", "vi"];
/**
 * Estimated print lines of all six titles and bodies above which the body
 * drops from 12 pt to 11 pt, the floor. Measured on 2026-11-04 with
 * Playwright page.pdf (docs/DEVLOG.md): 12 pt holds about 28 lines on one
 * A4 page, 11 pt about 41; beyond that the notice runs to a second page
 * rather than getting smaller.
 */
const COMPACT_LINES = 28;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const [found, lang] = await Promise.all([loadPublicCard(slug, id), getRequestLang()]);
  if (!found) return { title: "Engawa" };
  return {
    title: `${found.card.title[lang]} | ${t("notice.title", lang)} | Engawa`,
    robots: { index: false, follow: false },
  };
}

/**
 * Lines a text takes on a 186 mm print line at 12 pt, roughly: a CJK or
 * Hangul character is about twice as wide as a Latin one. Only used to pick
 * the size tier, never shown.
 */
function printLines(text: string): number {
  let units = 0;
  for (const ch of text) units += /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch) ? 2 : 1;
  return Math.max(1, Math.ceil(units / 80));
}

/**
 * Print styles live with the page, like the poster's: A4 portrait with
 * 12 mm margins, the on-screen controls hidden, body 12 pt or 11 pt for a
 * long card (never smaller). On screen the same sheet reads at phone width
 * with 16 px text. No child combinators here, so the CSS inlines as text.
 */
const CSS = `
@page { size: A4 portrait; margin: 12mm; }
.notice { box-sizing: border-box; width: 100%; max-width: 186mm; margin: 0 auto; padding: 16px 16px 48px; color: #111111; }
.notice-screen { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
.notice-screen .notice-hint { width: 100%; font-size: 1rem; color: var(--muted); }
.notice-link { display: inline-flex; min-height: 44px; align-items: center; padding: 0 20px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); font-weight: 600; }
.notice-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; padding-bottom: 6px; border-bottom: 2px solid #111111; }
.notice-brand { font-weight: 700; letter-spacing: 0.02em; }
.notice-board { font-size: 1rem; color: #333333; }
.notice-meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 10px; font-size: 1rem; line-height: 1.45; }
.notice-meta-col { flex: 1 1 240px; }
.notice-meta p { margin: 0; }
.notice-warn { font-weight: 700; }
.notice-block { margin-top: 12px; padding-top: 8px; border-top: 1px solid #bbbbbb; }
.notice-lang { margin: 0; font-size: 1rem; font-weight: 700; letter-spacing: 0.04em; color: #444444; }
.notice-title { margin: 2px 0 0; font-size: 1.25rem; font-weight: 800; line-height: 1.3; }
.notice-body { margin: 4px 0 0; font-size: 1.125rem; line-height: 1.5; white-space: pre-line; }
.notice-about { margin-top: 12px; padding-top: 8px; border-top: 1px solid #bbbbbb; font-size: 1rem; color: #333333; }
.notice-about p { margin: 0; }
.notice-about p + p { margin-top: 2px; }
.notice-foot { display: flex; align-items: center; gap: 14px; margin-top: 14px; padding-top: 10px; border-top: 2px solid #111111; }
.notice-qr { display: block; flex: none; width: 112px; height: auto; }
.notice-scan { margin: 0; padding: 0; list-style: none; font-size: 1rem; line-height: 1.4; }
.notice-url { margin: 4px 0 0; font-size: 1rem; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
@media print {
  html, body { background: #ffffff !important; color: #111111; }
  .notice { max-width: none; padding: 0; }
  .notice-screen { display: none; }
  .notice-brand { font-size: 11pt; }
  .notice-board { font-size: 10pt; }
  .notice-meta { font-size: 10.5pt; margin-top: 3mm; }
  .notice-block { margin-top: 2.5mm; padding-top: 1.5mm; break-inside: avoid; }
  .notice-lang { display: inline; margin-right: 3mm; font-size: 8.5pt; vertical-align: 0.1em; }
  .notice-title { display: inline; font-size: 13pt; }
  .notice-body { font-size: 12pt; line-height: 1.4; }
  .notice-about { font-size: 9pt; line-height: 1.35; margin-top: 2.5mm; padding-top: 1.5mm; }
  .notice-foot { margin-top: 3mm; padding-top: 2mm; break-inside: avoid; }
  .notice-qr { width: 28mm; }
  .notice-scan { columns: 2; column-gap: 5mm; font-size: 10pt; line-height: 1.3; }
  .notice-url { font-size: 9pt; }
  .notice-compact .notice-title { font-size: 12pt; }
  .notice-compact .notice-body { font-size: 11pt; line-height: 1.3; }
  .notice-compact .notice-block { margin-top: 1.5mm; padding-top: 1mm; }
}
`;

/** Place, time window, status and the outdated warning in one language. */
function Meta({ card, board, lang, now }: { card: Card; board: Board; lang: Lang; now: Date }) {
  const place = placeLabel(card, board, lang);
  const time = timeRange(card.valid_from, card.valid_until, lang);
  const status = card.facts.status && card.facts.status !== "unknown" ? card.facts.status : null;
  return (
    <div className="notice-meta-col" lang={lang}>
      {place ? (
        <p>
          {t("sheet.place", lang)}: {place}
        </p>
      ) : null}
      {time ? <p>{time}</p> : null}
      {status ? (
        <p>
          {t("card.status", lang)}: {t(`status.${status}`, lang)}
        </p>
      ) : null}
      {isExpired(card.valid_until, now) ? <p className="notice-warn">{t("card.outdated", lang)}</p> : null}
    </div>
  );
}

/** The source line in words and the date the paper was made, one line per language. */
function About({ card, lang, now }: { card: Card; lang: Lang; now: Date }) {
  // The card's own platform first: it names where the current wording and
  // label come from (an update or a stronger confirming source moves it),
  // so "the city's broadcast mail (official)" never reads as "the loudspeaker (official)".
  const platform = card.facts.platform ?? card.sources?.[0]?.platform ?? null;
  const source = card.official_confirmed
    ? t("card.official_confirmed", lang)
    : t(`trace.source.${card.source_type}`, lang);
  return (
    <p lang={lang}>
      {t("notice.source", lang, {
        input: t(traceInputKey(platform), lang),
        source,
        count: tCount("card.source_count", lang, card.source_count),
      })}
      {" · "}
      {t("notice.generated", lang, { date: formatFullDateTime(now, lang) })}
    </p>
  );
}

/**
 * The reverse of the drop-in: one public card as a printable A4 notice in
 * Japanese, easy Japanese, English, Chinese, Korean and Vietnamese, so a
 * building manager can put up a paper everyone can read next to the
 * Japanese-only original. Place and time once at the top in Japanese, with
 * the reader's language beside it when different; the board QR and URL at
 * the bottom so readers can see updates. Same 404 rules as the card page.
 */
export default async function NoticePage({ params }: Props) {
  const { slug, id } = await params;
  const [found, lang] = await Promise.all([loadPublicCard(slug, id), getRequestLang()]);
  if (!found) notFound();
  const { board, card } = found;
  const now = new Date();
  const url = new URL(`/b/${board.slug}`, await appBase()).toString();
  const qr = encodeQr(url);
  const view = qr.size + QR_MARGIN * 2;
  const lines = NOTICE_LANGS.reduce((n, l) => n + printLines(card.title[l]) + printLines(card.body[l]), 0);
  const compact = lines > COMPACT_LINES;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* data-print-sheet keeps the page light in every theme (app/globals.css): it is printed. */}
      <main className={compact ? "notice notice-compact" : "notice"} data-notice={card.id} data-print-lines={lines} data-print-sheet>
        <div className="notice-screen">
          <p className="notice-hint">{t("notice.hint", lang)}</p>
          <PrintButton />
          <Link href={cardPath(board.slug, card.id)} className="notice-link">
            {t("notice.back", lang)}
          </Link>
        </div>

        <header className="notice-head">
          <p className="notice-brand">Engawa 縁側</p>
          <p className="notice-board">
            <span lang="ja">{board.name.ja}</span>
            {board.name[lang] !== board.name.ja ? <span lang={lang}> · {board.name[lang]}</span> : null}
          </p>
        </header>

        <section className="notice-meta">
          <Meta card={card} board={board} lang="ja" now={now} />
          {lang !== "ja" ? <Meta card={card} board={board} lang={lang} now={now} /> : null}
        </section>

        {NOTICE_LANGS.map((l, i) => {
          // A language the translate step has not written yet carries an English
          // or Japanese stand-in on the card; the printed notice says so instead
          // of printing English under a Chinese heading.
          const pending = (card.missing_langs ?? []).includes(l);
          const blockLang: Lang = l === "easy_ja" ? "ja" : l;
          return (
            <section key={l} className="notice-block" lang={blockLang} data-notice-lang={l} data-pending={pending || undefined}>
              <p className="notice-lang">{t(`lang.${l}`, lang)}</p>
              {pending ? (
                <p className="notice-body">{t("card.translating", blockLang)}</p>
              ) : i === 0 ? (
                <h1 className="notice-title">{card.title[l]}</h1>
              ) : (
                <h2 className="notice-title">{card.title[l]}</h2>
              )}
              {pending ? null : <p className="notice-body">{card.body[l]}</p>}
            </section>
          );
        })}

        <section className="notice-about">
          <About card={card} lang="ja" now={now} />
          {lang !== "ja" ? <About card={card} lang={lang} now={now} /> : null}
        </section>

        <footer className="notice-foot">
          <svg
            className="notice-qr"
            role="img"
            aria-label={url}
            viewBox={`0 0 ${view} ${view}`}
            shapeRendering="crispEdges"
          >
            <rect width={view} height={view} fill="#ffffff" />
            <path d={qrPath(qr, QR_MARGIN)} fill="#000000" />
          </svg>
          <div>
            <ul className="notice-scan">
              {(["ja", ...LANGS.filter((l) => l !== "ja")] as Lang[]).map((l) => (
                <li key={l} lang={l}>
                  {t("notice.scan", l)}
                </li>
              ))}
            </ul>
            <p className="notice-url">{url}</p>
          </div>
        </footer>
      </main>
    </>
  );
}
