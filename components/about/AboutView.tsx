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
const DATA: MessageKey[] = ["about.data_1", "about.data_2", "about.data_3", "about.data_4"];

/**
 * After the event, the two-layer model: one platform operator for every
 * board, a local owner per board, what a new city costs (docs/BOARDS.md),
 * and what is not there yet (one operator, one admin token for every board).
 */
const AFTER: MessageKey[] = [
  "about.after_body",
  "about.after_operator",
  "about.after_owner",
  "about.after_new_city",
  "about.after_limits",
];

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
 * The about page body: who the board is for, the wall it removes, who lives
 * here (with the figures above), what happens to the data, who runs it after
 * the event (operator and local owners), and the credits (#credits, linked from under the home
 * page map). Client component so the language switch applies at once.
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
      <p className="mt-3 text-base leading-relaxed">{t("about.mission")}</p>

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
      </section>

      <section aria-labelledby="about-wall">
        <h2 id="about-wall" className="mt-8 text-xl font-bold">
          {t("about.wall_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.wall_body")}</p>
      </section>

      <section aria-labelledby="about-numbers">
        <h2 id="about-numbers" className="mt-8 text-xl font-bold">
          {t("about.numbers_heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed">{t("about.numbers_body", numbers)}</p>
      </section>

      <section aria-labelledby="about-data">
        <h2 id="about-data" className="mt-8 text-xl font-bold">
          {t("about.data_heading")}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-3 pl-5 text-base leading-relaxed">
          {DATA.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
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
