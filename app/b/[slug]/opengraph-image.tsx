import { ImageResponse } from "next/og";
import { markDataUrl } from "@/components/brand/Mark";
import { getBoardBySlug } from "@/lib/db/boards";
import { LANGS, t } from "@/lib/i18n";

export const alt = "Engawa: a neighbourhood board in Japanese, English, Chinese, Korean, Vietnamese and easy Japanese";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1b1b1b";
const MUTED = "#5c5c5c";
const ACCENT = "#1f5c3f";
const PAPER = "#fbfaf7";
const LINE = "#d9d6cf";

/**
 * One link preview image per board, the same for every language, since
 * crawlers do not say which language the reader uses. Japanese and English
 * side by side. Glyphs outside Latin are fetched by next/og as font subsets
 * at render time; the image is cached after the first request.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug).catch(() => null);
  const nameJa = board?.name.ja ?? "Engawa";
  const nameEn = board?.name.en ?? "";
  const languages = [...LANGS.map((l) => t(`lang.${l}`, l)), t("lang.easy_ja", "ja")];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "64px 72px",
          borderTop: `16px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img src={markDataUrl(PAPER)} width={60} height={60} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 48, fontWeight: 700 }}>Engawa</div>
            <div style={{ fontSize: 28, color: MUTED }}>縁側</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.1 }}>{nameJa}</div>
          {nameEn ? <div style={{ fontSize: 44, color: MUTED }}>{nameEn}</div> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 32 }}>
            <div>{t("app.tagline", "ja")}</div>
            <div style={{ color: MUTED }}>{t("app.tagline", "en")}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {languages.map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  fontSize: 26,
                  padding: "6px 18px",
                  borderRadius: 999,
                  border: `2px solid ${LINE}`,
                  background: "#ffffff",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
