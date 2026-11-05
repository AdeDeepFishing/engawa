/**
 * Checks the code-side phone and email check on fixed strings, without
 * calling the API: the phone formats people actually write on Japanese
 * notices must be caught, and the dates, times and postal codes on the same
 * notices must not be.
 *
 *   node --import=tsx scripts/check-contact.ts
 *
 * Exits 1 when a check fails. The numbers are made up (090-1234-5678) or the
 * public number of a ward office, not taken from any submission.
 */
import { containsContact, ExtractError, validateExtractResult } from "../lib/claude/extract";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

// --- caught ------------------------------------------------------------------

const caught: [string, string][] = [
  ["ASCII hyphens", "問合せ 090-1234-5678"],
  ["ASCII, landline", "高津区役所 044-861-3111"],
  ["no separators", "電話 09012345678"],
  ["full-width digits and hyphens", "０９０－１２３４－５６７８"],
  ["U+2010 hyphen", "090‐1234‐5678"],
  ["U+2011 non-breaking hyphen", "090‑1234‑5678"],
  ["U+2212 minus sign", "044−744−3113"],
  ["katakana long vowel mark", "090ー1234ー5678"],
  ["spaces", "090 1234 5678"],
  ["ideographic spaces", "090　1234　5678"],
  ["parentheses around the area code", "(044)744-3113"],
  ["parentheses and a space", "(044) 744-3113"],
  ["parentheses around the local part", "044(744)3113"],
  ["full-width parentheses", "（０４４）７４４－３１１３"],
  ["+81 with hyphens", "+81-90-1234-5678"],
  ["+81 with spaces", "+81 44 744 3113"],
  ["+81 with (0)", "+81 (0)90-1234-5678"],
  ["full-width +81", "＋８１－９０－１２３４－５６７８"],
  ["mobile with one hyphen", "090-12345678"],
  ["email", "tanaka@example.jp"],
  ["full-width email", "ｔａｎａｋａ＠ｅｘａｍｐｌｅ．ｊｐ"],
];
for (const [name, text] of caught) check(`caught: ${name}`, containsContact(text));

// --- left alone --------------------------------------------------------------

const clean: [string, string][] = [
  ["a date and time range", "11月16日（月）10:00〜15:00"],
  ["an ISO date", "2026-11-06"],
  ["a time range with hyphens", "10:00-15:00"],
  ["a Sapporo postal code", "〒060-0042 札幌市中央区大通西6丁目"],
  ["a Kawasaki postal code", "〒213-0001"],
  ["a price", "1,000円"],
  ["water per person", "1日3L、3日分"],
  ["a block address", "溝口3-12-1"],
  ["katakana with long vowels", "コーヒーとケーキ"],
  ["a weekday in parentheses", "11/14（土）13:30"],
];
for (const [name, text] of clean) check(`clean: ${name}`, !containsContact(text));

// --- the extract validator ---------------------------------------------------

function fact(over: Record<string, unknown>): Record<string, unknown> {
  return {
    category: "daily_notice",
    source_type: "firsthand",
    status: "planned",
    place_id: null,
    place_text_ja: null,
    valid_from: null,
    valid_until: null,
    risk_flags: [],
    confidence: "high",
    title: { ja: "防災訓練", en: "Disaster drill" },
    body: { ja: "11月16日に行います。", en: "Held on Nov 16." },
    original_excerpt: "",
    conditions: [],
    ...over,
  };
}

const { result } = validateExtractResult(
  { facts: [fact({ conditions: ["問合せ 田中 ０９０－１２３４－５６７８", "容器持参", "質問は 044−744−3113 まで"] })] },
  new Set(),
);
check(
  "validator: a condition with a phone number is dropped, the others kept",
  JSON.stringify(result.facts[0].conditions) === JSON.stringify(["容器持参"]),
);

let threw = false;
try {
  validateExtractResult({ facts: [fact({ body: { ja: "連絡先 090 1234 5678", en: "Call 090 1234 5678" } })] }, new Set());
} catch (e) {
  threw = e instanceof ExtractError && e.code === "pii_leak";
}
check("validator: a spaced phone number in the body still fails the whole call", threw);

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
