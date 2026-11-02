"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { TextSizeToggle } from "@/components/TextSizeToggle";

export function TopBar({ title, actions }: { title?: string; actions?: ReactNode }) {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Link href="/" className="tap flex items-center font-bold" aria-label={t("app.name")}>
          <span aria-hidden="true" className="mr-1 text-xl">縁</span>
          {t("app.name")}
        </Link>
        {title ? <span className="truncate text-lg font-semibold">{title}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <TextSizeToggle />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
