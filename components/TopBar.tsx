"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";
import { Mark } from "@/components/brand/Mark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * `wide` lets the bar span the board's workspace from 768 px up and keeps it
 * on one line from 1024 px; `home` matches the home page's 1152 px column;
 * every other page keeps the phone column.
 * `badge` follows the title (the board's mode); `primary` leads the controls
 * (the laptop drop-in button).
 */
export function TopBar({
  title,
  actions,
  badge,
  primary,
  wide = false,
  home = false,
}: {
  title?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  primary?: ReactNode;
  wide?: boolean;
  home?: boolean;
}) {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-accent-soft">
      <div
        className={`relative mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 ${
          wide ? "md:max-w-[1600px] lg:flex-nowrap xl:px-6" : home ? "md:max-w-6xl md:px-6" : ""
        }`}
      >
        <Link href="/" className="tap flex shrink-0 items-center font-bold hover:text-accent" aria-label={t("app.name")}>
          <Mark className="mr-1.5 size-5 shrink-0 text-accent" />
          {t("app.name")}
        </Link>
        {title ? <span className="min-w-0 truncate text-lg font-semibold">{title}</span> : null}
        {badge}
        {/* Never wider than the bar: on a narrow phone with large text the controls wrap to a second row instead of scrolling the page sideways. */}
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
          {primary}
          {actions}
          <TextSizeToggle />
          <ThemeToggle />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
