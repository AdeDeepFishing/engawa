import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBoardBySlug } from "@/lib/db/boards";
import { LANGS, t, type Lang } from "@/lib/i18n";
import { getRequestLang } from "@/lib/i18n/server";
import { encodeQr, qrPath } from "@/components/share/qr";
import { PrintButton } from "./PrintButton";
import { appBase } from "@/lib/app-url";

type Props = { params: Promise<{ slug: string }> };

const QR_MARGIN = 4;

/** Absolute board URL for the QR code and the printed line, from the shared app base. */
async function boardUrl(slug: string): Promise<string> {
  return new URL(`/b/${slug}`, await appBase()).toString();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [board, lang] = await Promise.all([getBoardBySlug(slug), getRequestLang()]);
  if (!board) return { title: "Engawa" };
  return { title: `${board.name[lang]} | ${t("poster.print", lang)} | Engawa` };
}

/**
 * Print styles live with the page: A4 portrait with 12 mm margins, no top
 * bar, the on-screen controls hidden. On screen the same sheet scales to the
 * phone width. No child combinators or ampersands here, so the CSS can be
 * inlined as text.
 */
const CSS = `
@page { size: A4 portrait; margin: 12mm; }
.poster { box-sizing: border-box; width: 100%; max-width: 186mm; margin: 0 auto; padding: 24px 16px 48px; text-align: center; color: #111111; }
.poster-screen { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px; }
.poster-screen .poster-hint { width: 100%; font-size: 1rem; color: var(--muted); }
.poster-back { display: inline-flex; min-height: 44px; align-items: center; padding: 0 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-weight: 600; }
.poster-brand { font-size: 1.125rem; font-weight: 700; letter-spacing: 0.02em; }
.poster-brand span { font-size: 1.5rem; margin-right: 0.25rem; vertical-align: -0.1em; }
.poster-title { margin: 8px 0 0; font-size: clamp(2rem, 9vw, 3.25rem); font-weight: 800; line-height: 1.15; }
.poster-title-alt { margin: 4px 0 0; font-size: 1.5rem; font-weight: 600; }
.poster-subtitle { margin: 8px 0 0; font-size: 1.25rem; }
.poster-qr { display: block; width: min(80vw, 110mm); height: auto; margin: 20px auto 0; }
.poster-url { margin: 8px 0 0; font-size: 1.125rem; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.poster-cta { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 6px; font-size: 1.125rem; line-height: 1.4; }
.poster-cta-easy { font-weight: 600; }
.poster-community { margin: 20px 0 0; font-size: 1rem; line-height: 1.5; color: #333333; }
.poster-about { display: inline-flex; min-height: 44px; align-items: center; text-decoration: underline; text-underline-offset: 4px; word-break: break-all; }
@media print {
  html, body { background: #ffffff !important; color: #111111; }
  .poster { max-width: none; padding: 0; }
  .poster-screen { display: none; }
  .poster-brand { font-size: 14pt; }
  .poster-title { font-size: 40pt; }
  .poster-title-alt { font-size: 20pt; }
  .poster-subtitle { font-size: 16pt; }
  .poster-qr { width: 105mm; margin-top: 10mm; }
  .poster-url { font-size: 13pt; }
  .poster-cta { font-size: 14pt; margin-top: 10mm; gap: 3mm; }
  .poster-community { font-size: 11pt; margin-top: 10mm; }
  .poster-about { min-height: 0; text-decoration: none; }
}
`;

/**
 * Printable A4 poster for a board: its name, a large QR code of the board
 * URL, the URL in text, one call to action per language plus やさしい日本語,
 * and a line saying anyone can drop in notices. No top bar.
 */
export default async function PosterPage({ params }: Props) {
  const { slug } = await params;
  const [board, lang] = await Promise.all([getBoardBySlug(slug), getRequestLang()]);
  if (!board) notFound();
  const url = await boardUrl(board.slug);
  const aboutUrl = new URL("/about", await appBase()).toString();
  const qr = encodeQr(url);
  const view = qr.size + QR_MARGIN * 2;
  // Japanese first because the poster hangs in Japan; then the other UI languages in their usual order.
  const ctaLangs: Lang[] = ["ja", ...LANGS.filter((l) => l !== "ja")];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* data-print-sheet keeps the page light in every theme (app/globals.css): it is printed. */}
      <main className="poster" data-print-sheet>
        <div className="poster-screen">
          <p className="poster-hint">{t("poster.print_hint", lang)}</p>
          <PrintButton />
          <Link href={`/b/${board.slug}`} className="poster-back">
            {t("poster.back", lang)}
          </Link>
        </div>
        <p className="poster-brand">
          <span aria-hidden="true">縁</span>
          Engawa 縁側
        </p>
        <h1 className="poster-title" lang="ja">
          {board.name.ja}
        </h1>
        {board.name[lang] !== board.name.ja ? (
          <p className="poster-title-alt" lang={lang}>
            {board.name[lang]}
          </p>
        ) : null}
        <p className="poster-subtitle" lang={lang}>
          {t("poster.subtitle", lang)}
        </p>
        <svg
          className="poster-qr"
          role="img"
          aria-label={url}
          viewBox={`0 0 ${view} ${view}`}
          shapeRendering="crispEdges"
        >
          <rect width={view} height={view} fill="#ffffff" />
          <path d={qrPath(qr, QR_MARGIN)} fill="#000000" />
        </svg>
        <p className="poster-url">{url}</p>
        <ul className="poster-cta">
          {ctaLangs.map((l) => (
            <li key={l} lang={l}>
              {t("poster.cta", l)}
            </li>
          ))}
          <li lang="ja" className="poster-cta-easy">
            {t("poster.cta_easy", lang)}
          </li>
        </ul>
        <p className="poster-community" lang={lang}>
          {t("poster.community", lang)}
        </p>
        <p className="poster-community" lang={lang}>
          <Link href="/about" className="poster-about">
            {t("poster.about", lang, { url: aboutUrl })}
          </Link>
        </p>
      </main>
    </>
  );
}
