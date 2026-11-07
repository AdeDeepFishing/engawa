"use client";

import Link from "next/link";
import { INTL_LOCALE, type MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/**
 * Figures quoted on the page, from the city's published statistics. The
 * source and the reference month are named in the text next to each number
 * (keys about.numbers_body); change both together.
 *
 * - cityTotal, wardTotal: 川崎市「管区別年齢別外国人住民人口」, 住民基本台帳,
 *   令和8年9月末日現在 (foreign residents in Kawasaki City and in Nakahara Ward).
 * - zh, ko, vi, ph, np: 川崎市「外国人国籍地域別統計」, 令和7年度分, 2026年3月末,
 *   the five largest nationality groups in Nakahara Ward.
 */
export const FOREIGN_RESIDENTS = {
  cityTotal: 65745,
  wardTotal: 8631,
  zh: 2451,
  ko: 1154,
  vi: 686,
  ph: 635,
  np: 495,
} as const;

const WHO: MessageKey[] = ["about.who_maria", "about.who_sato", "about.who_chen"];

/** The three layers of the pipeline, each named and then described. */
const LAYERS: { title: MessageKey; body: MessageKey }[] = [
  { title: "about.layer_claude_title", body: "about.layer_claude_body" },
  { title: "about.layer_code_title", body: "about.layer_code_body" },
  { title: "about.layer_people_title", body: "about.layer_people_body" },
];

/** What a reader can rely on (trust), then what happens to the data (docs/PRIVACY.md). */
const DATA: MessageKey[] = [
  "about.trust_1",
  "about.trust_2",
  "about.trust_3",
  "about.data_1",
  "about.data_2",
  "about.data_3",
  "about.data_4",
];

/**
 * Where it stands: the six boards and the demo samples on them, what works
 * today and which boards have a city source; then the two-layer model meant
 * for after the event (docs/BOARDS.md for a new city), and what is not there
 * yet (one operator, one admin token for every board).
 */
const AFTER: MessageKey[] = [
  "about.status_body",
  "board.demo_note",
  "about.status_working",
  "about.after_body",
  "about.after_operator",
  "about.after_owner",
  "about.after_new_city",
  "about.after_limits",
];

/** Where a group that wants a board for its area can write. */
const ISSUES_URL = "https://github.com/AdeDeepFishing/engawa/issues";

/**
 * Sources of the home page map's prefecture outlines (CC BY 4.0, see
 * components/home/japan-map-paths.ts), named in about.credits_map. The labels
 * are names and stay the same in every language.
 */
const MAP_CREDIT_LINKS = [
  { label: "svg-maps", href: "https://github.com/VictorCazanave/svg-maps" },
  { label: "MapSVG", href: "https://mapsvg.com/maps/japan" },
  { label: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
] as const;

/**
 * The about page body, deeper than the home page: what Engawa is and the
 * fragmentation it answers, why it exists (with the figures above), how it
 * works in three layers (Claude, code, people) and what that does not
 * promise, who it is for, every day and in a disaster, privacy and trust
 * (#about-data, linked from the home footer), how to take part, where it
 * stands and what is next, and the credits (#credits, linked from under the
 * home page map). Client component so the language switch applies at once.
 */
export function AboutView({ backHref }: { backHref: string | null }) {
  const { lang, t } = useLang();
  const nf = new Intl.NumberFormat(INTL_LOCALE[lang]);
  const numbers = Object.fromEntries(
    Object.entries(FOREIGN_RESIDENTS).map(([k, v]) => [k, nf.format(v)]),
  ) as Record<keyof typeof FOREIGN_RESIDENTS, string>;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("about.title")}</h1>
      <p className="mt-3 text-base leading-relaxed">{t("about.lead")}</p>
      <p className="mt-3 text-base leading-relaxed">{t("about.what_body")}</p>

      <section aria-labelledby="about-why">
        <h2 id="about-why" className="mt-8 text-xl font-bold">
          {t("about.why_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.why_body")}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.numbers_body", numbers)}</p>
      </section>

      <section aria-labelledby="about-how">
        <h2 id="about-how" className="mt-8 text-xl font-bold">
          {t("about.how_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.how_body")}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.how_ask")}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.how_layers")}</p>
        <ul className="mt-3 flex flex-col gap-3">
          {LAYERS.map((layer) => (
            <li key={layer.title} className="rounded-xl border border-line bg-surface px-4 py-3">
              <h3 className="text-base font-bold">{t(layer.title)}</h3>
              <p className="mt-1 text-base leading-relaxed">{t(layer.body)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-base leading-relaxed">{t("about.how_limits")}</p>
      </section>

      <section aria-labelledby="about-who">
        <h2 id="about-who" className="mt-8 text-xl font-bold">
          {t("about.who_heading")}
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {WHO.map((key) => (
            <li key={key} className="rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed">
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-base leading-relaxed">{t("about.who_groups")}</p>
      </section>

      <section aria-labelledby="about-everyday">
        <h2 id="about-everyday" className="mt-8 text-xl font-bold">
          {t("about.everyday_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.everyday_body")}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.everyday_disaster")}</p>
      </section>

      <section aria-labelledby="about-data">
        {/* scroll-mt keeps the heading clear of the sticky top bar when reached from the home footer. */}
        <h2 id="about-data" className="mt-8 scroll-mt-32 text-xl font-bold">
          {t("about.data_heading")}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-3 pl-5 text-base leading-relaxed">
          {DATA.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-join">
        <h2 id="about-join" className="mt-8 text-xl font-bold">
          {t("about.join_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.join_1", { button: t("dropin.button") })}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.join_2")}</p>
        <p className="mt-3 text-base leading-relaxed">{t("about.join_3")}</p>
        <p className="mt-1">
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tap inline-flex items-center text-base font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t("about.join_link")}
            <span className="sr-only"> {t("maps.new_tab")}</span>
          </a>
        </p>
      </section>

      <section aria-labelledby="about-after">
        <h2 id="about-after" className="mt-8 text-xl font-bold">
          {t("about.after_heading")}
        </h2>
        {AFTER.map((key) => (
          <p key={key} className="mt-3 text-base leading-relaxed">
            {t(key)}
          </p>
        ))}
      </section>
      {/* scroll-mt keeps the heading clear of the sticky top bar when reached by its anchor. */}
      <section id="credits" aria-labelledby="about-credits" className="scroll-mt-32">
        <h2 id="about-credits" className="mt-8 text-xl font-bold">
          {t("about.credits_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.credits_map")}</p>
        <ul className="mt-1 flex flex-wrap gap-x-6">
          {MAP_CREDIT_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="tap inline-flex items-center text-base underline underline-offset-4 hover:text-accent">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10">
        <Link
          href={backHref ?? "/"}
          className="tap inline-flex items-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:border-accent"
        >
          {backHref ? t("about.back_board") : t("about.back_home")}
        </Link>
      </p>
    </main>
  );
}
