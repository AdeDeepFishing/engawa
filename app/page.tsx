import Link from "next/link";
import { listBoards } from "@/lib/db/boards";
import { getRequestLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";

export default async function Home() {
  const [lang, boards] = await Promise.all([getRequestLang(), listBoards()]);
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-bold">{t("index.title", lang)}</h1>
        <p className="mt-1 text-muted">{t("index.pick", lang)}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                href={`/b/${b.slug}`}
                className="tap flex items-center rounded-xl border border-line bg-surface px-4 py-3 text-lg font-semibold hover:border-accent"
              >
                {b.name[lang]} <span className="ml-2 text-base font-normal text-muted">{b.name.ja}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
