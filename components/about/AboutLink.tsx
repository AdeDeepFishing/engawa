"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";

/** Footer link from a board to the about page, which links back to the board. */
export function AboutLink({ boardSlug }: { boardSlug?: string }) {
  const { t } = useLang();
  const href = boardSlug ? `/about?b=${encodeURIComponent(boardSlug)}` : "/about";
  return (
    <Link
      href={href}
      className="tap inline-flex items-center text-base text-muted underline underline-offset-4 hover:text-foreground"
    >
      {t("board.footer_about")}
    </Link>
  );
}
