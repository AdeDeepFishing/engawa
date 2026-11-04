/**
 * Text clean-up for the official inbox, in code, before extract sees the
 * mail: the signature and the subscription footer are cut, so the model
 * reads only the broadcast. Written with the layout of メールニュースかわさき
 * in mind (subject, the broadcast text, then a footer that starts at a line
 * of dashes or at a line about 配信停止 or the send only address) and the
 * usual "-- " signature delimiter. Pure functions, no I/O; checked by
 * `pnpm check:inbox` (scripts/check-inbox.ts).
 */

/**
 * A line made only of rule characters, at least three: ASCII and full width
 * hyphens and equals signs, the katakana long vowel mark, box drawing lines,
 * underscores, asterisks, the horizontal bar. Written as escapes so this file
 * holds none of the dashes the repository's guard rejects.
 */
const RULE_LINE = /^\s*(?:[-=_*~#\u2015\u2500\u2501\u2550\u30fc\uff0d\uff1d\uff3f\uff0a]\s*){3,}$/u;

/** The conventional signature delimiter: everything after it is the signature. */
const SIGNATURE_LINE = /^--\s?$/u;

/** Lines that open a footer: unsubscribe and settings notes, the send only note. */
const FOOTER_START: readonly RegExp[] = [
  /^[※＊*・■□◆◇●○\s]*(配信停止|配信解除|配信の停止|配信の解除|登録解除|登録の解除|登録内容の変更|配信先の変更|配信の変更|メール配信の停止)/u,
  /^[※＊*・■□◆◇●○\s]*(この|本)メールは.{0,12}(送信専用|配信専用)/u,
  /^[※＊*・■□◆◇●○\s]*(このメールに|本メールに).{0,6}(返信|ご返信)/u,
  /^\s*(to\s+)?unsubscribe\b/iu,
  /^\s*this (e-?mail|message) (is|was) sent from a (send|no-?reply)/iu,
];

/**
 * Lines a footer after a rule line is made of when it carries no
 * unsubscribe note: a bare link, an address, the publisher, a contact desk.
 */
const FOOTER_LIKE: readonly RegExp[] = [
  /^\s*<?https?:\/\/\S+>?\s*$/iu,
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
  /^[※＊*・■□◆◇●○\s]*(発行|発信|配信元|編集|問い合わせ|お問い合わせ|問合せ|お問合せ|連絡先|TEL|Tel|tel|電話|FAX|Fax|ファクス)/u,
  /^.{0,30}(本部|局|課|室|係|センター)\s*$/u,
];

export const MAX_SUBJECT_CHARS = 200;
/** After cleaning; the route refuses a body over 20 KB before this. */
export const MAX_MAIL_TEXT_CHARS = 8000;

/**
 * Cuts the signature and the footer off a mail body:
 * - at a "-- " signature line;
 * - at the first unsubscribe or send only note that follows some content;
 * - at the last rule line after content when everything below it is footer
 *   matter (links, addresses, the publisher, a contact desk).
 * Rule lines that stay (a separator under a heading, between paragraphs) are
 * decoration and dropped. Blank line runs collapse to one.
 */
export function stripMailFooter(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/u, ""));
  let end = lines.length;
  let seenContent = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SIGNATURE_LINE.test(line) || (seenContent && FOOTER_START.some((re) => re.test(line)))) {
      end = i;
      break;
    }
    if (line.trim() && !RULE_LINE.test(line)) seenContent = true;
  }
  let kept = lines.slice(0, end);
  const lastRule = kept.findLastIndex((l) => RULE_LINE.test(l));
  if (lastRule > 0 && kept.slice(0, lastRule).some((l) => l.trim() && !RULE_LINE.test(l))) {
    const below = kept.slice(lastRule + 1).filter((l) => l.trim() && !RULE_LINE.test(l));
    if (below.length > 0 && below.every((l) => FOOTER_LIKE.some((re) => re.test(l)))) kept = kept.slice(0, lastRule);
  }
  return kept
    .filter((l) => !RULE_LINE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The text extract receives: the subject line, a blank line, the cleaned body. */
export function mailText(subject: string, body: string): string {
  const cleanSubject = subject.replace(/\s+/g, " ").trim().slice(0, MAX_SUBJECT_CHARS);
  const cleanBody = stripMailFooter(body).slice(0, MAX_MAIL_TEXT_CHARS);
  return [cleanSubject ? `件名: ${cleanSubject}` : "", cleanBody].filter(Boolean).join("\n\n");
}

const ADDRESS_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/u;

/**
 * The bare address of a From value, lower case: `news@example.jp` from
 * `"メールニュースかわさき" <News@Example.jp>` or from the bare address.
 * Null when there is no single plausible address.
 */
export function senderAddress(from: string): string | null {
  const angle = /<([^<>]+)>\s*$/u.exec(from.trim());
  const candidate = (angle ? angle[1] : from).trim().toLowerCase();
  if (candidate.length > 254 || !ADDRESS_RE.test(candidate)) return null;
  return candidate;
}

/** Only the domain of an address, for log lines that must not carry the address itself. */
export function senderDomain(from: string): string {
  const address = senderAddress(from);
  return address ? address.slice(address.indexOf("@") + 1) : "unparsable";
}

export const MAX_INBOX_SENDERS = 10;

/**
 * Normalizes the admin's list: one address per entry, lower case, no
 * duplicates, at most ten. Returns the clean list and the entries refused.
 */
export function normalizeSenders(entries: readonly string[]): { senders: string[]; invalid: string[] } {
  const senders: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const address = senderAddress(trimmed);
    if (!address) invalid.push(trimmed.slice(0, 80));
    else if (!senders.includes(address)) senders.push(address);
  }
  if (senders.length > MAX_INBOX_SENDERS) invalid.push(...senders.splice(MAX_INBOX_SENDERS));
  return { senders, invalid };
}
