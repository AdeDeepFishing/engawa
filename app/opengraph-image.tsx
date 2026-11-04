import { ImageResponse } from "next/og";
import { BRAND, BRAND_JA } from "@/components/brand/Mark";
import { MarkImage } from "@/components/brand/icon-image";
import { LANGS, t } from "@/lib/i18n";

export const alt = "縁側 Engawa: a neighbourhood board that turns paper notices, chat screenshots and text into cards in six languages";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Link preview for the home page and every page without its own (the board
 * pages have theirs next to them). The mark, the name and the one-line
 * description in Japanese and English, since crawlers do not say which
 * language the reader uses, and the six languages the cards are written in.
 */
export default function Image() {
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
          background: BRAND.paper,
          color: BRAND.ink,
          padding: "64px 72px",
          borderTop: `16px solid ${BRAND.accent}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <MarkImage color={BRAND.accent} box={168} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, fontSize: 112, fontWeight: 700 }}>
            <div>{BRAND_JA}</div>
            <div>Engawa</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 34, lineHeight: 1.35 }}>
          <div>{t("home.lead", "ja")}</div>
          <div style={{ color: BRAND.muted }}>{t("home.lead", "en")}</div>
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
                border: `2px solid ${BRAND.line}`,
                background: "#ffffff",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
