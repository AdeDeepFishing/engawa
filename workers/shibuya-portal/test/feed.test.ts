/**
 * The poller without a network: the portal and the inbox are a fake fetch
 * that serves the fixtures in test/fixtures (as text/html, the list with a
 * byte order mark) and answers posts from a queue; KV is a Map.
 * Run with `pnpm test` (node --test through tsx).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  broadcasts,
  classify,
  englishAddsFacts,
  inboxBody,
  jstIso,
  LIST_FILE,
  monthFiles,
  PORTAL_BASE,
  type InboxBody,
  type State,
} from "../src/feed";
import { LEASE_KEY, runOnce, STATE_KEY, type RunResult, type Store } from "../src/run";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const OCT = fixture("radio_202610.json");
const AUG = fixture("radio_202608.json");
const NOV = fixture("radio_202611.json");
const INBOX = "https://engawa.test/api/b/shibuya/inbox";
const SENDER = "portal@bosai.city.shibuya.tokyo.jp";
const BOM = "﻿";

const monthFile = (yyyymm: string) => `renkei_73_bosai_radio_${yyyymm}.js`;

/** A list naming these months, in this order, as the portal writes it. */
function listOf(...months: string[]) {
  return { Update_At: "2026/11/05 10:31", BosaiRadioList: { content: months.map((m) => ({ month: m, filename: monthFile(m) })) } };
}

/** A month file with only the broadcasts at these update_at values. */
function monthWith(month: unknown, keep: string[]) {
  const copy = structuredClone(month) as { BosaiRadio: { information: { update_at: string }[] } };
  copy.BosaiRadio.information = copy.BosaiRadio.information.filter((i) => keep.includes(i.update_at));
  return copy;
}

const keyOf = (month: unknown, updateAt: string) => broadcasts(month).broadcasts.find((b) => b.updateAt === updateAt)!.key;

class MemoryStore implements Store {
  readonly map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  state(): State | null {
    const raw = this.map.get(STATE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  }
}

/** Until October: what the portal served on 2026-11-04. */
const BEFORE_NOVEMBER = () => ({
  [LIST_FILE]: listOf("202610", "202608"),
  [monthFile("202610")]: OCT,
  [monthFile("202608")]: AUG,
});

/** After the two drill broadcasts of 2026/11/05 (or only those named). */
const WITH_NOVEMBER = (keep = ["2026/11/05 10:00", "2026/11/05 10:30"]) => ({
  ...BEFORE_NOVEMBER(),
  [LIST_FILE]: listOf("202611", "202610", "202608"),
  [monthFile("202611")]: monthWith(NOV, keep),
});

function harness(files: Record<string, unknown>, store = new MemoryStore()) {
  const h = {
    files,
    store,
    /** Inbox answers, used in order; a 201 with one card when empty. */
    answers: [] as [number, unknown][],
    posts: [] as InboxBody[],
    portalCalls: [] as string[],
    logs: [] as string[],
    secret: "test-secret" as string | undefined,
    run(now: string): Promise<RunResult> {
      return runOnce({
        fetch: fakeFetch,
        store: h.store,
        inboxUrl: INBOX,
        inboxSecret: h.secret,
        sender: SENDER,
        now: () => Date.parse(now),
        log: (line) => h.logs.push(line),
      });
    },
  };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    assert.match(headers["User-Agent"], /^engawa-shibuya-portal\//);
    assert.ok(init?.signal, "every fetch has a timeout");
    if (url.startsWith(PORTAL_BASE)) {
      const file = decodeURIComponent(url.slice(PORTAL_BASE.length));
      h.portalCalls.push(file);
      const json = h.files[file];
      if (json === undefined) return new Response("not found", { status: 404 });
      const text = (file === LIST_FILE ? BOM : "") + JSON.stringify(json, null, 2);
      return new Response(text, { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }
    if (url === INBOX) {
      assert.equal(init?.method, "POST");
      assert.equal(headers.Authorization, `Bearer ${h.secret}`);
      h.posts.push(JSON.parse(String(init?.body)) as InboxBody);
      const [status, body] = h.answers.shift() ?? [201, { card_ids: ["card-1"] }];
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return h;
}

/** A harness whose state was seeded on 2026-11-04 from the feed of that day, with November then published. */
async function seededThenNovember(keep?: string[]) {
  const h = harness(BEFORE_NOVEMBER());
  await h.run("2026-11-04T12:00:00+09:00");
  h.files = WITH_NOVEMBER(keep);
  h.portalCalls.length = 0;
  return h;
}

const AT_1035 = "2026-11-05T10:35:00+09:00";

test("JST conversion: update_at is read as +09:00", () => {
  assert.equal(jstIso("2026/10/16 12:40"), "2026-10-16T12:40:00+09:00");
  assert.equal(Date.parse(jstIso("2026/10/16 12:40")!), Date.UTC(2026, 9, 16, 3, 40));
  assert.equal(jstIso("2026/1/5 9:05"), "2026-01-05T09:05:00+09:00");
  assert.equal(Date.parse(jstIso("2026/11/01 00:30")!), Date.UTC(2026, 9, 31, 15, 30), "the day before in UTC");
  assert.equal(jstIso("2026/13/01 10:00"), null);
  assert.equal(jstIso("2026/10/16"), null);
  assert.equal(jstIso(""), null);
  const quake = broadcasts(OCT).broadcasts[0];
  assert.equal(inboxBody(quake, SENDER).received_at, "2026-10-16T12:40:00+09:00");
});

test("first run stores the newest update_at and posts nothing", async () => {
  const h = harness(BEFORE_NOVEMBER());
  const first = await h.run("2026-11-04T12:00:00+09:00");
  assert.equal(first.status, "seeded");
  assert.deepEqual(first.posted, []);
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.state()?.last_update_at, "2026/10/16 12:40");
  assert.deepEqual(h.store.state()?.posted, [keyOf(OCT, "2026/10/16 12:40")]);
  assert.deepEqual(h.portalCalls, [LIST_FILE, monthFile("202610")], "the newest month has broadcasts, so only it is read");

  const second = await h.run("2026-11-04T12:05:00+09:00");
  assert.equal(second.status, "idle");
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.map.has(LEASE_KEY), false);
});

test("a new entry after the stored time is posted once", async () => {
  const h = await seededThenNovember(["2026/11/05 10:00"]);
  const run = await h.run("2026-11-05T10:03:00+09:00");
  assert.equal(run.status, "done");
  assert.deepEqual(run.posted, ["2026/11/05 10:00"]);
  assert.deepEqual(h.posts, [
    {
      from: SENDER,
      subject: "総合防災訓練",
      text: "こちらは、ぼうさいしぶやです。\n本日10時から総合防災訓練を行います。これは訓練放送です。",
      received_at: "2026-11-05T10:00:00+09:00",
    },
  ]);
  assert.equal(h.store.state()?.last_update_at, "2026/11/05 10:00");
  assert.ok(h.portalCalls.includes(monthFile("202610")), "November starts after the stored time, so October is read too");

  const again = await h.run("2026-11-05T10:08:00+09:00");
  assert.equal(again.status, "idle");
  assert.equal(h.posts.length, 1, "not posted a second time");
});

test("two new entries post oldest first, the English line only where it adds a fact", async () => {
  const h = await seededThenNovember();
  const run = await h.run(AT_1035);
  assert.deepEqual(run.posted, ["2026/11/05 10:00", "2026/11/05 10:30"]);
  assert.deepEqual(
    h.posts.map((p) => p.received_at),
    ["2026-11-05T10:00:00+09:00", "2026-11-05T10:30:00+09:00"],
  );
  assert.ok(!h.posts[0].text.includes("英語"), "10:00 in both languages: no English line");
  assert.equal(
    h.posts[1].text,
    "こちらは、ぼうさいしぶやです。\n本日の総合防災訓練は終了しました。ご協力ありがとうございました。\n" +
      "英語: This is Bosai Shibuya. Today's disaster drill ended at 10:30. Thank you for your cooperation.",
  );
  const state = h.store.state()!;
  assert.equal(state.last_update_at, "2026/11/05 10:30");
  assert.deepEqual(state.posted.slice(-2), [keyOf(NOV, "2026/11/05 10:00"), keyOf(NOV, "2026/11/05 10:30")]);
});

test("a failure stops the sequence and the next run retries from it", async () => {
  const h = await seededThenNovember();
  h.answers.push([500, { error: "pii_leak", submission_id: "sub-1" }]);
  const failed = await h.run(AT_1035);
  assert.equal(failed.status, "stopped");
  assert.deepEqual(failed.posted, []);
  assert.equal(h.posts.length, 1, "10:30 is not tried after 10:00 failed");
  assert.equal(h.store.state()?.last_update_at, "2026/10/16 12:40", "nothing stored for the failed entry");
  assert.deepEqual(h.store.state()?.failing, { key: keyOf(NOV, "2026/11/05 10:00"), attempts: 1, error: "pii_leak" });
  assert.ok(h.logs.some((l) => l === "stopped at 2026/11/05 10:00: 500 pii_leak, attempt 1 of 3, retried next run"));
  assert.equal(h.store.map.has(LEASE_KEY), false, "the lease is released after a failure");

  const retry = await h.run("2026-11-05T10:40:00+09:00");
  assert.deepEqual(retry.posted, ["2026/11/05 10:00", "2026/11/05 10:30"]);
  assert.equal(h.store.state()?.failing, undefined);
});

test("429 and 503 stop the run without counting an attempt, 403 points at the setup", async () => {
  for (const [status, error] of [
    [503, "busy"],
    [429, "rate_limited"],
    [403, "sender_not_allowed"],
  ] as const) {
    const h = await seededThenNovember();
    h.answers.push([status, { error }]);
    const run = await h.run(AT_1035);
    assert.equal(run.status, "stopped");
    assert.equal(h.posts.length, 1);
    assert.equal(h.store.state()?.last_update_at, "2026/10/16 12:40");
    assert.equal(h.store.state()?.failing, undefined, `${status} counts no attempt`);
  }
});

test("a broadcast that fails three times is passed over on the fourth run", async () => {
  const h = await seededThenNovember();
  for (let i = 0; i < 3; i++) h.answers.push([500, { error: "refusal" }]);
  for (const minute of ["35", "40", "45"]) await h.run(`2026-11-05T10:${minute}:00+09:00`);
  assert.equal(h.store.state()?.failing?.attempts, 3);
  const fourth = await h.run("2026-11-05T10:50:00+09:00");
  assert.deepEqual(fourth.posted, ["2026/11/05 10:30"]);
  assert.equal(h.posts.length, 4, "three tries of 10:00, one post of 10:30");
  assert.ok(h.logs.includes("passed over 2026/11/05 10:00: given up after 3 failed posts (last error refusal)"));
  assert.ok(h.store.state()?.posted.includes(keyOf(NOV, "2026/11/05 10:00")), "never tried again");
});

test("a duplicate key is skipped even when the stored time is behind", async () => {
  const store = new MemoryStore();
  // A run that read an old state: the time is October's, but 10:00 was already posted.
  const stale: State = {
    last_update_at: "2026/10/16 12:40",
    posted: [keyOf(OCT, "2026/10/16 12:40"), keyOf(NOV, "2026/11/05 10:00")],
  };
  await store.put(STATE_KEY, JSON.stringify(stale));
  const h = harness(WITH_NOVEMBER(), store);
  const run = await h.run(AT_1035);
  assert.deepEqual(run.posted, ["2026/11/05 10:30"]);
  assert.equal(h.posts.length, 1);
  assert.ok(h.logs.some((l) => l.includes("1 held back as already posted")));
});

test("two broadcasts in the same minute are both posted", async () => {
  const h = await seededThenNovember(["2026/11/05 10:00"]);
  const nov = structuredClone(h.files[monthFile("202611")]) as { BosaiRadio: { information: Record<string, unknown>[] } };
  const second = structuredClone(nov.BosaiRadio.information[0]);
  second.title = "総合防災訓練（第2報）";
  (second.multi_lang as { ja: { title: string } }).ja.title = "総合防災訓練（第2報）";
  nov.BosaiRadio.information.unshift(second);
  h.files[monthFile("202611")] = nov;
  const run = await h.run("2026-11-05T10:03:00+09:00");
  assert.deepEqual(run.posted, ["2026/11/05 10:00", "2026/11/05 10:00"]);
  assert.deepEqual(
    h.posts.map((p) => p.subject),
    ["総合防災訓練", "総合防災訓練（第2報）"],
    "the feed's newest first order is reversed",
  );
  await h.run("2026-11-05T10:08:00+09:00");
  assert.equal(h.posts.length, 2);
});

test("the month before is read when the newest month has no broadcast", async () => {
  const h = harness({ ...WITH_NOVEMBER([]) });
  const run = await h.run("2026-11-05T09:00:00+09:00");
  assert.equal(run.status, "seeded");
  assert.deepEqual(h.portalCalls, [LIST_FILE, monthFile("202611"), monthFile("202610")]);
  assert.equal(h.store.state()?.last_update_at, "2026/10/16 12:40");
});

test("a broadcast older than 24 hours is passed over, not posted", async () => {
  const h = await seededThenNovember();
  const run = await h.run("2026-11-07T10:00:00+09:00");
  assert.deepEqual(run.posted, []);
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.state()?.last_update_at, "2026/11/05 10:30");
  assert.ok(h.logs.includes("passed over 2026/11/05 10:00: older than 24 hours, not posted"));
});

test("a run holding the lease keeps the next one from posting", async () => {
  const h = await seededThenNovember();
  await h.store.put(LEASE_KEY, String(Date.parse(AT_1035) + 60_000));
  assert.equal((await h.run(AT_1035)).status, "locked");
  assert.equal(h.posts.length, 0);
  await h.store.put(LEASE_KEY, String(Date.parse(AT_1035) - 1));
  assert.equal((await h.run(AT_1035)).posted.length, 2, "an expired lease does not block");
});

test("without the secret nothing is posted and nothing is stored", async () => {
  const h = await seededThenNovember();
  h.secret = undefined;
  const before = h.store.map.get(STATE_KEY);
  assert.equal((await h.run(AT_1035)).status, "no_secret");
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.map.get(STATE_KEY), before);
});

test("a portal error stops the run before anything is posted", async () => {
  const h = await seededThenNovember();
  delete h.files[monthFile("202610")];
  const run = await h.run(AT_1035);
  assert.equal(run.status, "portal_error");
  assert.equal(h.posts.length, 0);
  assert.ok(h.logs.includes("portal month 2: status 404, nothing done"));
});

test("log lines carry counts, statuses and times, never broadcast text", async () => {
  const logs: string[] = [];
  const h1 = await seededThenNovember();
  h1.answers.push([500, { error: "なにか Something long went wrong" }]);
  await h1.run(AT_1035);
  await h1.run("2026-11-05T10:40:00+09:00");
  const h2 = await seededThenNovember();
  await h2.run("2026-11-07T10:00:00+09:00");
  logs.push(...h1.logs, ...h2.logs);
  assert.ok(logs.length >= 6);
  for (const line of logs) {
    assert.doesNotMatch(line, /[぀-ヿ㐀-鿿]/, `no Japanese in "${line}"`);
    assert.doesNotMatch(line, /drill|earthquake|shibuya city|something/i, `no message text in "${line}"`);
  }
  assert.ok(h1.logs.includes("stopped at 2026/11/05 10:00: 500 unknown, attempt 1 of 3, retried next run"));
});

test("the English line: only a real English text with a number or link the Japanese lacks", () => {
  assert.equal(englishAddsFacts("緊急地震速報。大地震です。", "Earthquake Early Warning. Major earthquake."), false);
  assert.equal(englishAddsFacts("本日10時から訓練を行います。", "A drill starts today at 10:00."), false);
  assert.equal(englishAddsFacts("１５時に避難所を開設します。", "Shelters open at 15:00."), false, "full width digits");
  assert.equal(englishAddsFacts("本日、訓練は終了しました。", "The drill ended at 10:30."), true);
  assert.equal(englishAddsFacts("詳しくは区のホームページへ。", "Details: https://www.city.shibuya.tokyo.jp/bosai/"), true);
  assert.equal(englishAddsFacts("緊急地震速報。大地震です。", "緊急地震速報。大地震です。"), false, "a copy of the Japanese");
  assert.equal(englishAddsFacts("避難所を開設しました。", ""), false);
  assert.equal(englishAddsFacts("", "Shelters are open."), true, "nothing in Japanese");
});

test("month files: newest first, anything else dropped", () => {
  const list = {
    BosaiRadioList: {
      content: [
        { month: "202607", filename: "renkei_73_bosai_radio_202607.js" },
        { month: "x", filename: "../../etc/passwd" },
        { month: "202610", filename: "renkei_73_bosai_radio_202610.js" },
        { month: "202611", filename: "https://example.com/renkei_73_bosai_radio_202611.js" },
      ],
    },
  };
  assert.deepEqual(monthFiles(list), ["renkei_73_bosai_radio_202610.js", "renkei_73_bosai_radio_202607.js"]);
  assert.deepEqual(monthFiles({}), []);
});

test("the inbox's answer: 201 counts cards, error codes are kept short", () => {
  assert.deepEqual(classify(201, JSON.stringify({ card_ids: ["a", "b"] })), { kind: "posted", cards: 2 });
  assert.deepEqual(classify(503, JSON.stringify({ error: "busy" })), { kind: "busy", status: 503, error: "busy" });
  assert.deepEqual(classify(500, "<html>"), { kind: "failed", status: 500, error: "unknown" });
  assert.deepEqual(classify(422, JSON.stringify({ error: "empty" })), { kind: "failed", status: 422, error: "empty" });
});
