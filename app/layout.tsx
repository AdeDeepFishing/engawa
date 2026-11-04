import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/LangProvider";
import { OfflineSupport } from "@/components/offline/OfflineSupport";
import { getRequestLang, getRequestTextSize } from "@/lib/i18n/server";
import { appBase } from "@/lib/app-url";
import { BRAND, BRAND_JA } from "@/components/brand/Mark";

/**
 * Defaults for every page; the home, board and card pages set their own
 * title and description. The icons are listed here rather than left to the
 * file conventions, so the order is fixed: the SVG mark first (it follows
 * the browser's dark mode), the 32 px PNG for browsers without SVG
 * favicons, and the iOS home screen icon. app/manifest.ts carries the
 * Android icons.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: await appBase(),
    title: "Engawa",
    description:
      "A neighbourhood board that turns paper notices, chat screenshots and text into cards everyone can read in six languages.",
    robots: { index: false, follow: false },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        { url: "/icon", type: "image/png", sizes: "32x32" },
      ],
      apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: `${BRAND_JA} Engawa`, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: BRAND.accent,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, textSize] = await Promise.all([getRequestLang(), getRequestTextSize()]);
  return (
    <html lang={lang} data-text-size={textSize} className="h-full">
      <body className="min-h-full flex flex-col">
        <LangProvider initialLang={lang} initialTextSize={textSize}>
          <OfflineSupport />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
