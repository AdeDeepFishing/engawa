/**
 * Checks the official inbox's code paths that need no API and no database:
 * the footer and signature stripping, the sender address parsing, the
 * sender list normalization, the inbox secret comparison, and the channel
 * rule that fixes source type and platform after extract.
 *
 *   pnpm check:inbox
 *
 * Exits 1 when a check fails. The mails are written here in the layout the
 * city's broadcast mail uses (subject, broadcast text, a footer under a rule
 * line with the send only note and the unsubscribe link); the addresses use
 * example.jp. Rule lines are built from escapes so this file holds none of
 * the dashes the repository's guard rejects.
 */
import { applyChannel, type ExtractResult } from "../lib/claude/extract";
import { inboxSecretMatches, newInboxSecret } from "../lib/db/inbox";
import { mailText, normalizeSenders, senderAddress, senderDomain, stripMailFooter } from "../lib/inbox/clean";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

const DASHES = "-".repeat(40);
const BARS = "─".repeat(20);
const BROADCAST = "こちらは、防災かわさきです。小杉小学校で本日15時から給水を行います。容器をお持ちください。";

// --- footers -------------------------------------------------------------------

const kawasakiLayout = [
  "【防災行政無線放送内容】",
  BARS,
  BROADCAST,
  "",
  DASHES,
  "※このメールは送信専用です。返信はできません。",
  "配信停止・登録内容の変更は以下から",
  "https://mail.example.jp/kawasaki/",
  DASHES,
  "発行：川崎市総務企画局危機管理本部",
].join("\n");
const stripped = stripMailFooter(kawasakiLayout);
check("footer: the broadcast text under a heading rule stays", stripped.includes(BROADCAST));
check("footer: the heading stays, its rule line goes", stripped.startsWith("【防災行政無線放送内容】") && !stripped.includes("─"));
check("footer: the send only note, the unsubscribe link and the publisher go", !/送信専用|配信停止|https:|発行/.test(stripped));

const contactOnly = [BROADCAST, "", DASHES, "川崎市危機管理本部", "TEL 044-000-0000", "https://www.example.jp/"].join("\n");
check("footer: a rule line followed only by a contact desk and a link is a footer", stripMailFooter(contactOnly) === BROADCAST);

const twoParagraphs = ["一つ目の段落です。", DASHES, "二つ目の段落も放送の内容です。"].join("\n");
check("footer: a rule line between two broadcast paragraphs keeps both", stripMailFooter(twoParagraphs) === "一つ目の段落です。\n二つ目の段落も放送の内容です。");

const signature = [BROADCAST, "", "-- ", "Forwarded by a test address", "someone@example.jp"].join("\n");
check("footer: everything after a signature delimiter goes", stripMailFooter(signature) === BROADCAST);

const unsubscribeFirst = ["配信停止はこちら", BROADCAST].join("\n");
check("footer: an unsubscribe line before any content does not cut the mail", stripMailFooter(unsubscribeFirst).includes(BROADCAST));

const crlf = [BROADCAST, "", "", "", "二行目です。", "To unsubscribe, visit the link."].join("\r\n");
check("footer: CRLF, blank runs collapse to one, an English unsubscribe line goes", stripMailFooter(crlf) === `${BROADCAST}\n\n二行目です。`);

check("mail text: the subject comes first as 件名", mailText("  防災行政無線  放送内容 ", BROADCAST) === `件名: 防災行政無線 放送内容\n\n${BROADCAST}`);
check("mail text: no subject, body only", mailText("", BROADCAST) === BROADCAST);

// --- senders ---------------------------------------------------------------------

check("sender: display name and angle brackets", senderAddress('"メールニュースかわさき" <News@Example.JP>') === "news@example.jp");
check("sender: bare address", senderAddress("bousai@example.jp") === "bousai@example.jp");
check("sender: not an address", senderAddress("メールニュースかわさき") === null && senderAddress("a@b") === null);
check("sender: the log line gets the domain only", senderDomain("someone@example.jp") === "example.jp" && senderDomain("nonsense") === "unparsable");
const normalized = normalizeSenders([" News@Example.jp ", "news@example.jp", "", "not an address"]);
check("senders: lower case, deduplicated, blanks skipped, invalid entries reported", JSON.stringify(normalized) === '{"senders":["news@example.jp"],"invalid":["not an address"]}');
const many = normalizeSenders(Array.from({ length: 12 }, (_, i) => `s${i}@example.jp`));
check("senders: at most ten, the rest reported", many.senders.length === 10 && many.invalid.length === 2);

// --- secret ------------------------------------------------------------------------

const { secret, hash } = newInboxSecret();
check("secret: 43 characters of base64url, a 64 hex digest", /^[A-Za-z0-9_-]{43}$/.test(secret) && /^[0-9a-f]{64}$/.test(hash));
check("secret: the right secret matches", inboxSecretMatches(secret, hash));
check("secret: a wrong one, an empty one and a missing hash do not", !inboxSecretMatches(`${secret}x`, hash) && !inboxSecretMatches("", hash) && !inboxSecretMatches(secret, null));

// --- channel rule ----------------------------------------------------------------------

// The channel rule logs a count when it changes a source type; keep the table clean.
const warn = console.warn;
console.warn = () => undefined;
const fact = (sourceType: "official" | "firsthand" | "secondhand" | "unknown") => ({
  category: "water" as const,
  place_id: null,
  place_text_ja: null,
  status: "planned" as const,
  valid_from: null,
  valid_until: null,
  conditions: [],
  source_type: sourceType,
  risk_flags: [],
  confidence: "high" as const,
  title: { ja: "給水", en: "Water" },
  body: { ja: "給水", en: "Water" },
  original_excerpt: "",
});
const result = (platform: ExtractResult["source_platform"], ...types: ("official" | "secondhand")[]): ExtractResult => ({
  input_language: "ja",
  source_platform: platform,
  facts: types.map(fact),
  discarded: [],
  note_for_uploader: null,
});
const heard = applyChannel(result("other", "official", "secondhand"), "loudspeaker");
check("channel: a heard transcript is secondhand on the loudspeaker, even when it claims to be official", heard.source_platform === "loudspeaker" && heard.facts.every((f) => f.source_type === "secondhand"));
const mail = applyChannel(result("other", "secondhand"), "city_mail");
check("channel: a mail from the official inbox is official city mail", mail.source_platform === "city_mail" && mail.facts.every((f) => f.source_type === "official"));
check("channel: without a channel, city_mail and loudspeaker become other", applyChannel(result("city_mail", "official"), undefined).source_platform === "other" && applyChannel(result("loudspeaker", "secondhand"), undefined).source_platform === "other");
check("channel: without a channel, everything else is left alone", applyChannel(result("line", "secondhand"), undefined).source_platform === "line");
console.warn = warn;

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
