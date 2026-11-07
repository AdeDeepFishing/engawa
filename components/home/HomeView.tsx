"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { BRAND_JA, Mark } from "@/components/brand/Mark";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { BoardSummary, boardAnchor, type HomeBoard } from "./BoardSummary";
import { JapanMap } from "./JapanMap";
import type { MapPin } from "./map-pins";
import { Tagline } from "./Tagline";

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: "home.step1_title", body: "home.step1_body" },
  { title: "home.step2_title", body: "home.step2_body" },
  { title: "home.step3_title", body: "home.step3_body" },
];

/** The three-minute demo video, linked next to the call to action. */
const DEMO_VIDEO = "https://youtu.be/lYskkSfmo2s";

/** Id of the boards heading: the hero's call to action scrolls to it. */
const BOARDS_HEADING = "home-boards";

/** Body text on the home page: 17 px at the default size, in rem so the text size toggle scales it. */
const BODY = "text-[1.0625rem] leading-relaxed";

/** Entrance delay for the `home-rise` and `home-pop` animations (app/globals.css). */
function rise(ms: number): CSSProperties {
  return { "--rise-delay": `${ms}ms` } as CSSProperties;
}

/**
 * A footer link: 44 px target, no underline at rest, one drawn from the
 * left on hover and on keyboard focus.
 */
function FooterLink({ href, external, children }: { href: string; external?: "me" | "source"; children: ReactNode }) {
  const { t } = useLang();
  const className = "tap group inline-flex items-center text-base hover:text-accent";
  const label = (
    <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-200 ease-out group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px]">
      {children}
    </span>
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  if (!external) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel={external === "me" ? "me noopener noreferrer" : "noopener noreferrer"} className={className}>
      {label}
      <span className="sr-only"> {t("maps.new_tab")}</span>
    </a>
  );
}

/**
 * The home page body (/). From 1024 px two columns, 7 to 5: the
 * hero (縁側 Engawa, the tagline as the headline in six languages, what
 * Engawa does, a link down to the boards and the demo video link)
 * and the listed boards on the left; the map of Japan on the right, held in
 * view while the boards scroll. On a phone: hero, map, boards. Then the
 * fragmentation it answers (one neighbourhood, many information worlds),
 * every day and in a disaster, the three steps in the words the board itself
 * uses, how to try it with a sample, and the footer. The hero lines, the
 * boards and the map rise in once, 60 ms apart (none of it under reduced
 * motion); the sections below stay still. Client component so the language
 * switch in the top bar applies at once, like the about page; the board
 * facts and `now` come from the server render, so both renders agree.
 */
export function HomeView({ boards, pins, now }: { boards: HomeBoard[]; pins: MapPin[]; now: string }) {
  const { t } = useLang();

  /** From the map: bring the pin's first board card into view and move focus to it, so a screen reader follows. */
  function goToPin(pin: MapPin) {
    const first = boards.find((b) => pin.slugs.includes(b.slug));
    const el = first ? document.getElementById(boardAnchor(first.slug)) : null;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Focus first: a focus() after a smooth scrollIntoView cancels the scroll in Chrome.
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  /** The hero's call to action: scroll to the boards heading and move focus to it, the same way as goToPin. */
  function goToBoards(e: MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById(BOARDS_HEADING);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 md:px-6 lg:pt-20">
        {/* Phones read hero, map, boards; from lg the hero and the boards share the left column and the map stays on the right. */}
        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-20">
          <div className="contents lg:block">
            <section aria-labelledby="home-title" className="order-1">
              <h1
                id="home-title"
                className="home-rise flex flex-wrap items-baseline gap-x-4 text-[clamp(2.5rem,1.75rem+3vw,3.5rem)] leading-[1.1] font-bold"
                style={rise(0)}
              >
                <span lang="ja" className="tracking-[0.08em]">
                  {BRAND_JA}
                </span>
                <span className="tracking-[-0.01em]">{t("app.name")}</span>
              </h1>
              <Tagline
                className="home-rise mt-6 text-[clamp(1.5rem,1.25rem+1vw,2rem)] leading-snug font-bold"
                style={rise(60)}
              />
              <p className="home-rise mt-4 max-w-[60ch] text-xl leading-relaxed" style={rise(120)}>
                {t("home.lead")}
              </p>
              <p className="home-rise mt-4 flex flex-wrap items-center gap-x-8" style={rise(180)}>
                <a
                  href={`#${BOARDS_HEADING}`}
                  onClick={goToBoards}
                  className="tap inline-flex items-center gap-2 text-lg font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
                >
                  {t("home.cta")}
                  <span aria-hidden="true">↓</span>
                </a>
                <a
                  href={DEMO_VIDEO}
                  target="_blank"
                  rel="noopener"
                  className="tap inline-flex items-center text-base text-muted underline underline-offset-4 hover:text-accent"
                >
                  {t("home.demo_video")}
                  <span className="sr-only"> {t("maps.new_tab")}</span>
                </a>
              </p>
            </section>

            <section aria-labelledby={BOARDS_HEADING} className="order-3 mt-12 lg:order-none lg:mt-16">
              <div className="home-rise" style={rise(240)}>
                {/* Focusable so the call to action above can move focus here; scroll-mt clears the sticky top bar. */}
                <h2 id={BOARDS_HEADING} tabIndex={-1} className="scroll-mt-28 text-xl font-bold">
                  {t("home.boards_heading")}
                </h2>
                <p className={`mt-2 max-w-[60ch] text-muted ${BODY}`}>{t("home.boards_lead")}</p>
              </div>
              {boards.length ? (
                <ul className="mt-5 grid gap-4 md:grid-cols-2">
                  {boards.map((b, i) => (
                    <li key={b.slug} className="home-rise" style={rise(360 + i * 60)}>
                      <BoardSummary board={b} now={now} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`mt-5 text-muted ${BODY}`}>{t("home.no_boards")}</p>
              )}
            </section>
          </div>

          <section aria-labelledby="home-map" className="home-rise order-2 mt-12 lg:sticky lg:top-24 lg:order-none lg:mt-0" style={rise(300)}>
            <h2 id="home-map" className="text-xl font-bold">
              {t("home.map_heading")}
            </h2>
            <div className="mt-4 md:max-w-[30rem] lg:max-w-none">
              <JapanMap boards={boards} pins={pins} onSelect={goToPin} />
            </div>
            <p className={`mt-4 ${BODY}`}>{t("home.map_hint")}</p>
            {/* The CC BY 4.0 credit for the outlines is on the about page, one tap away. */}
            <p>
              <Link
                href="/about#credits"
                className="tap inline-flex items-center text-base text-muted underline underline-offset-4 hover:text-accent"
              >
                {t("home.map_credits_link")}
              </Link>
            </p>
          </section>
        </div>

        <section aria-labelledby="home-why" className="mt-14 lg:mt-24">
          <h2 id="home-why" className="text-xl font-bold text-balance [word-break:auto-phrase]">
            {t("home.why_heading")}
          </h2>
          <p className={`mt-4 max-w-[60ch] ${BODY}`}>
            {t("home.why_1")}
          </p>
          <p className={`mt-2 max-w-[60ch] ${BODY}`}>
            {t("home.why_2")}
          </p>
          <p className={`mt-2 max-w-[60ch] font-semibold text-accent ${BODY}`}>
            {t("home.why_3")}
          </p>
        </section>

        <section aria-labelledby="home-everyday" className="mt-14 lg:mt-24">
          <h2 id="home-everyday" className="text-xl font-bold text-balance [word-break:auto-phrase]">
            {t("home.disaster_heading")}
          </h2>
          <p className={`mt-4 max-w-[60ch] font-semibold ${BODY}`}>{t("home.disaster_body")}</p>
          <p className={`mt-2 max-w-[60ch] ${BODY}`}>{t("home.everyday_body")}</p>
        </section>

        <section aria-labelledby="home-steps" className="mt-14 lg:mt-24">
          <h2 id="home-steps" className="text-xl font-bold">
            {t("home.steps_heading")}
          </h2>
          <ol className="mt-6 grid gap-4 lg:grid-cols-3 lg:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-6 lg:flex-col">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-held-bg text-lg font-bold"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold">{t(step.title)}</h3>
                  <p className={`mt-2 ${BODY}`}>{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className={`mt-6 rounded-xl bg-held-bg px-6 py-4 ${BODY}`} data-home-try>
          {t("home.try", { button: t("dropin.button"), samples: t("sample.heading") })}
        </p>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pt-14 pb-10 md:px-6 lg:pt-24">
        {/*
          One hairline closes the page, broken by the mark in the rule's own
          colour. The mark is 20 px with 1.25 px of its own inset on each
          side, so the 16 px gap reads as about one mark width either side.
        */}
        <div aria-hidden="true" className="flex items-center gap-4">
          <span className="flex-1 border-t border-line" />
          <Mark className="size-5 shrink-0 text-line-strong" />
          <span className="flex-1 border-t border-line" />
        </div>
        {/*
          From lg one row: the product links on the left with the event line
          under them, the maker alone on the right. Narrower, the links stack
          (two columns from sm), then the maker, then the event line.
        */}
        <div className="grid pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-10">
          <ul className="grid gap-x-6 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <li>
              <FooterLink href="https://github.com/AdeDeepFishing/engawa" external="source">
                {t("home.source")}
              </FooterLink>
            </li>
            <li>
              <FooterLink href="https://claude.com/claude-code" external="source">
                {t("home.built_with")}
              </FooterLink>
            </li>
            <li>
              <FooterLink href="/about">{t("home.footer_about")}</FooterLink>
            </li>
            <li>
              <FooterLink href="/about#about-data">{t("footer.privacy")}</FooterLink>
            </li>
          </ul>
          <p className="lg:col-start-2 lg:row-start-1">
            <FooterLink href="https://www.yanwensworld.com/" external="me">
              {t("home.made_by")}
            </FooterLink>
          </p>
          <p className="mt-4 text-base text-muted lg:col-start-1">{t("footer.made_for")}</p>
        </div>
      </footer>
    </>
  );
}
