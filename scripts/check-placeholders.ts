/**
 * Checks the translate placeholder rule on fixed strings, without calling
 * the API: a target that drops or alters a bracketed placeholder of its
 * Japanese or English source loses that language for that item only.
 *
 *   node --import=tsx scripts/check-placeholders.ts
 *
 * Exits 1 when a check fails. The strings are written here, modelled on the
 * seed's water outage notice (11月〔X〕日), not taken from any submission.
 */
import {
  lostPlaceholders,
  placeholderCounts,
  TranslateError,
  validateTranslateResult,
  type TranslateItem,
} from "../lib/claude/translate";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

function counts(text: string): string {
  return JSON.stringify(Object.fromEntries(placeholderCounts(text)));
}

// Validator warnings would interleave with the table; collect them instead.
const warnings: string[] = [];
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(" "));
};

// --- tokens ------------------------------------------------------------------

check("tokens: 〔X〕 and 〔曜〕 in a notice date", counts("11月〔X〕日（〔曜〕）10:00") === '{"X":1,"曜":1}');
check("tokens: a repeated ［名前］ counts twice", counts("［名前］さんと［名前］さん") === '{"名前":2}');
check("tokens: half-width [X] and full-width ［Ｘ］ are the same placeholder", counts("[X] ［Ｘ］") === '{"X":2}');
check("tokens: no brackets, no placeholders", counts("Water outage on Nov X") === "{}");
check("tokens: empty brackets are not a placeholder", counts("［］ [ ]") === "{}");

// --- lost placeholders -------------------------------------------------------

const sources = ["断水のお知らせ：11月〔X〕日 10:00〜15:00", "Water outage: Nov [X], 10:00 to 15:00"];
check("lost: kept as written", lostPlaceholders(sources, "停水通知：11月〔X〕日 10:00至15:00") === 0);
check("lost: other bracket kind still keeps it", lostPlaceholders(sources, "停水通知：11月［X］日 10:00至15:00") === 0);
check("lost: brackets dropped", lostPlaceholders(sources, "단수 안내: 11월 X일 10:00~15:00") === 1);
check("lost: inside altered", lostPlaceholders(sources, "停水通知：11月〔某〕日 10:00至15:00") === 1);
check(
  "lost: one of two occurrences dropped",
  lostPlaceholders(["［名前］さんと［名前］さんへ", "To [名前] and [名前]"], "致［名前］和他的朋友") === 1,
);
check("lost: a source without placeholders never fails", lostPlaceholders(["給水所", "Water point"], "供水点") === 0);

// --- the validator -----------------------------------------------------------

const items: TranslateItem[] = [
  {
    title: { ja: sources[0], en: sources[1] },
    body: { ja: "配管点検のため断水します。", en: "Water will be cut off for pipe inspection." },
  },
  {
    title: { ja: "給水所が開いています", en: "Water point is open" },
    body: { ja: "容器を持参してください。", en: "Bring your own container." },
  },
  {
    title: { ja: "掲示板のお知らせ", en: "Notice board" },
    body: { ja: "〔X〕号室の前に置いてください。", en: "Leave it in front of room [X]." },
  },
];

const raw = {
  items: [
    {
      index: 0,
      // zh keeps 〔X〕, ko drops the brackets, vi switches to ［X］.
      title: { zh: "停水通知：11月〔X〕日 10:00至15:00", ko: "단수 안내: 11월 X일 10:00~15:00", vi: "Cắt nước: ngày ［X］ tháng 11, 10:00 đến 15:00" },
      body: { zh: "因管道检查暂停供水。", ko: "배관 점검으로 단수됩니다.", vi: "Cắt nước để kiểm tra đường ống." },
    },
    {
      index: 1,
      title: { zh: "供水点已开放", ko: "급수소가 열려 있습니다", vi: "Điểm cấp nước đang mở" },
      body: { zh: "请自带容器。", ko: "용기를 가져오세요.", vi: "Hãy mang theo bình chứa." },
    },
    {
      index: 2,
      // The title has nothing to keep; the vi body loses 〔X〕 while its title is fine.
      title: { zh: "公告栏通知", ko: "게시판 안내", vi: "Thông báo bảng tin" },
      body: { zh: "请放在〔X〕号房间门前。", ko: "〔X〕호 앞에 두세요.", vi: "Hãy để trước phòng." },
    },
  ],
};

const out = validateTranslateResult(raw, items, ["zh", "ko", "vi"]);
const langsOf = (i: number) => ({ title: Object.keys(out[i].title).sort().join(","), body: Object.keys(out[i].body).sort().join(",") });
check("validator: item 0 keeps zh and vi, drops ko from title and body", JSON.stringify(langsOf(0)) === '{"title":"vi,zh","body":"vi,zh"}');
check("validator: item 1 without placeholders keeps every language", JSON.stringify(langsOf(1)) === '{"title":"ko,vi,zh","body":"ko,vi,zh"}');
check("validator: item 2 drops vi when only its body lost the placeholder", JSON.stringify(langsOf(2)) === '{"title":"ko,zh","body":"ko,zh"}');
check("validator: kept text is passed through unchanged", out[0].title.zh === raw.items[0].title.zh);
check("validator: one warning per dropped language, counts only", warnings.length === 2 && warnings.every((w) => !w.includes("号") && !w.includes("X")));

let wholeBatch = false;
try {
  validateTranslateResult(
    { items: [{ ...raw.items[1], index: 0, body: { ...raw.items[1].body, zh: "请致电 090-1234-5678。" } }] },
    [items[1]],
    ["zh", "ko", "vi"],
  );
} catch (e) {
  wholeBatch = e instanceof TranslateError && e.code === "pii_leak";
}
check("validator: a phone number still fails the whole call", wholeBatch);

console.warn = warn;
console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
