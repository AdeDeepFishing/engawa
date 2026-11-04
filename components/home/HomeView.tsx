"use client";

import Link from "next/link";
import { BRAND_JA, Mark } from "@/components/brand/Mark";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { BoardSummary, type HomeBoard } from "./BoardSummary";

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "home.step1_title", body: "home.step1_body" },
  { title: "home.step2_title", body: "home.step2_body" },
  { title: "home.step3_title", body: "home.step3_body" },
];

const linkClass =
  "tap inline-flex items-center text-base underline underline-offset-4 hover:text-accent";

/**
 * The home page body (/): what Engawa is and for whom, the listed boards with
 * their live facts, the three steps in the words the board itself uses, how
 * to try it with a sample, and the footer. Client component so the language
 * switch in the top bar applies at once, like the about page; the board
 * facts and `now` come from the server render, so both renders agree.
 */
export function HomeView({ boards, now }: { boards: HomeBoard[]; now: string }) {
  const { t } = useLang();

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-4 md:px-6 lg:pt-14">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start lg:gap-14">
          <section aria-labelledby="home-title">
            <Mark className="size-16 text-accent" />
            <h1 id="home-title" className="mt-4 text-4xl font-bold">
              <span lang="ja">{BRAND_JA}</span> {t("app.name")}
            </h1>
            <p className="mt-4 text-xl leading-relaxed">{t("home.lead")}</p>
            <p className="mt-3 text-lg leading-relaxed text-muted">{t("home.for_whom")}</p>
          </section>

          <section aria-labelledby="home-boards" className="mt-10 lg:mt-0">
            <h2 id="home-boards" className="text-xl font-bold">
              {t("index.title")}
            </h2>
            {boards.length ? (
              <ul className="mt-3 flex flex-col gap-4">
                {boards.map((b) => (
                  <li key={b.slug}>
                    <BoardSummary board={b} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-base text-muted">{t("home.no_boards")}</p>
            )}
          </section>
        </div>

        <section aria-labelledby="home-steps" className="mt-12 lg:mt-16">
          <h2 id="home-steps" className="text-xl font-bold">
            {t("home.steps_heading")}
          </h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 md:flex-col md:gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-held-bg text-lg font-bold text-accent"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold">{t(step.title)}</h3>
                  <p className="mt-1 text-base leading-relaxed">{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl bg-held-bg px-4 py-3 text-base leading-relaxed" data-home-try>
            {t("home.try", { button: t("dropin.button"), samples: t("sample.heading") })}
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pt-6 pb-10 md:px-6">
        <div className="border-t border-line pt-4">
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <Link href="/about" className={linkClass}>
                {t("home.footer_about")}
              </Link>
            </li>
            <li>
              <Link href="/about#about-data" className={linkClass}>
                {t("footer.privacy")}
              </Link>
            </li>
            <li>
              <a href="https://claude.com/claude-code" className={linkClass}>
                {t("home.built_with")}
              </a>
            </li>
          </ul>
          <p className="mt-2 text-base text-muted">{t("footer.made_for")}</p>
        </div>
      </footer>
    </>
  );
}
