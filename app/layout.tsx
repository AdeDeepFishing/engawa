import type { Metadata } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/LangProvider";
import { getRequestLang, getRequestTextSize } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Engawa",
  description: "A multilingual neighbourhood board for Japan.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, textSize] = await Promise.all([getRequestLang(), getRequestTextSize()]);
  return (
    <html lang={lang} data-text-size={textSize} className="h-full">
      <body className="min-h-full flex flex-col">
        <LangProvider initialLang={lang} initialTextSize={textSize}>
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
