"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { TextSizeToggle } from "@/components/TextSizeToggle";

/**
 * `wide` lets the bar span the board's workspace from 768 px up and keeps it
 * on one line from 1024 px; every other page keeps the phone column.
 * `badge` follows the title (the board's mode); `primary` leads the controls
 * (the laptop drop-in button).
 */
export function TopBar({
  title,
  actions,
  badge,
  primary,
  wide = false,
}: {
  title?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  primary?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div
        className={`relative mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 ${
          wide ? "md:max-w-[1600px] md:px-6 lg:flex-nowrap" : ""
        }`}
      >
        <Link href="/" className="tap flex shrink-0 items-center font-bold hover:text-accent" aria-label={t("app.name")}>
          <span aria-hidden="true" className="mr-1 text-xl">縁</span>
          {t("app.name")}
        </Link>
        {title ? <span className="min-w-0 truncate text-lg font-semibold">{title}</span> : null}
        {badge}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {primary}
          {actions}
          <TextSizeToggle />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
