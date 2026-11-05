import { tAround, type Lang, type MessageKey } from "@/lib/i18n";

type Parts = { text: string; ja: string | null };

/**
 * A 町丁目 name as `areaName` gives it, printed the way places are: the name
 * in the reader's language, then the Japanese name in parentheses marked
 * lang="ja", which is what the street signs say. A name that is Japanese
 * only (no name in the reader's language yet) is marked lang="ja" itself.
 */
export function AreaName({ name, lang }: { name: Parts; lang: Lang }) {
  return (
    <>
      <span lang={lang !== "ja" && name.ja === null ? "ja" : undefined}>{name.text}</span>
      {name.ja ? (
        <>
          {" "}
          <span lang="ja">({name.ja})</span>
        </>
      ) : null}
    </>
  );
}

/** A UI string whose {area} placeholder holds an area name: "Self-reported area: Kosugi-machi 2-chome (小杉町2丁目)". */
export function WithAreaName({ message, name, lang }: { message: MessageKey; name: Parts; lang: Lang }) {
  const [before, after] = tAround(message, lang, "area");
  return (
    <>
      {before}
      <AreaName name={name} lang={lang} />
      {after}
    </>
  );
}
