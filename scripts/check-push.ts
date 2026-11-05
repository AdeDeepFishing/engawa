/**
 * Checks the web push rules that need no keys and no database: which card
 * alerts, which change is a new version, what the notification says in each
 * language, and which subscriptions the route accepts.
 *
 *   pnpm check:push
 *
 * Exits 1 when a check fails. The card texts are fictional.
 */
import {
  alertWorthy,
  cardChanges,
  cardPayload,
  disasterModePayload,
  firstLine,
  isPushEndpoint,
  newVersion,
  validKeys,
  type AlertCard,
} from "../lib/push/rules";
import type { Category, Platform, SourceType, Visibility } from "../lib/types";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

const card = (
  category: Category,
  sourceType: SourceType,
  platform: Platform = "paper",
  visibility: Visibility = "public",
): Pick<AlertCard, "category" | "source_type" | "visibility" | "facts"> => ({
  category,
  source_type: sourceType,
  visibility,
  facts: { platform },
});

// --- which cards alert -----------------------------------------------------------

check("official danger alerts", alertWorthy(card("danger", "official")));
check("official notice alerts", alertWorthy(card("official_notice", "official")));
check("official shelter alerts", alertWorthy(card("shelter", "official")));
check("official water alerts", alertWorthy(card("water", "official")));
check("official shops does not alert", !alertWorthy(card("shops", "official")));
check("official daily notice does not alert", !alertWorthy(card("daily_notice", "official")));
check("loudspeaker danger alerts (secondhand)", alertWorthy(card("danger", "secondhand", "loudspeaker")));
check("city mail danger alerts", alertWorthy(card("danger", "official", "city_mail")));
check("loudspeaker water does not alert (secondhand)", !alertWorthy(card("water", "secondhand", "loudspeaker")));
check("secondhand shop text does not alert", !alertWorthy(card("shops", "secondhand", "other")));
check("secondhand danger from a chat does not alert", !alertWorthy(card("danger", "secondhand", "line")));
check("firsthand water does not alert", !alertWorthy(card("water", "firsthand", "other")));
check("held official danger does not alert", !alertWorthy(card("danger", "official", "paper", "held")));
check("hidden official notice does not alert", !alertWorthy(card("official_notice", "official", "paper", "hidden")));

// --- which change is a new version ---------------------------------------------------

check("create is new", newVersion({ actions: ["create"], raised: false }));
check("update is new", newVersion({ actions: ["update"], raised: false }));
check("plain merge is not new", !newVersion({ actions: ["merge"], raised: false }));
check("merge that raised the source is new", newVersion({ actions: ["merge"], raised: true }));
check("conflict is not new", !newVersion({ actions: ["conflict"], raised: false }));
check("hold is not new", !newVersion({ actions: ["hold"], raised: false }));

const changes = cardChanges({
  decisions: [
    { action: "create", card_id: "a" },
    { action: "merge", card_id: "a", raised: false },
    { action: "merge", card_id: "b", raised: true },
    { action: "hold", card_id: "c" },
  ],
  publicIds: ["a", "b"],
});
check("changes: one per public card", changes.length === 2 && changes.every((c) => c.card_id !== "c"));
check("changes: a card touched twice keeps both actions", changes.find((c) => c.card_id === "a")?.actions.join() === "create,merge");
check("changes: raised carries over", changes.find((c) => c.card_id === "b")?.raised === true);

// --- what the notification says ----------------------------------------------------------

const id = "0b5e6c2a-3f4d-4e1a-9c7b-2d8e5f6a7b8c";
const written = {
  id,
  title: { ja: "中原区に避難指示", en: "Evacuation order for Nakahara Ward", zh: "中原区发布避难指示" },
  body: { ja: "\n警戒レベル4、避難指示を発令しました。\n小杉小学校に避難所を開設しています。", en: "Alert level 4.\nShelter at Kosugi Elementary." },
} as unknown as Pick<AlertCard, "id" | "title" | "body">;
const ja = cardPayload(written, { slug: "test" }, "ja");
check("payload ja: Japanese title", ja.title === "中原区に避難指示");
check("payload ja: first non-empty line of the body", ja.body === "警戒レベル4、避難指示を発令しました。");
check("payload ja: card URL with ?lang=ja", ja.url === `/b/test/c/${id}?lang=ja`);
check("payload: tag per card", ja.tag === `card-${id}`);
check("payload: the 192 icon", ja.icon === "/icons/192");
check("payload zh: Chinese title, English body until translate lands", cardPayload(written, { slug: "test" }, "zh").title === "中原区发布避难指示" && cardPayload(written, { slug: "test" }, "zh").body === "Alert level 4.");
check("payload ko: falls back to English", cardPayload(written, { slug: "test" }, "ko").title === "Evacuation order for Nakahara Ward");
check("payload zh: notification lang zh-CN", cardPayload(written, { slug: "test" }, "zh").lang === "zh-CN");
check("first line is cut at 160 characters", Array.from(firstLine("あ".repeat(400))).length === 160);

const board = { id, slug: "test", name: { ja: "武蔵小杉", en: "Musashi-Kosugi", zh: "武藏小杉", ko: "무사시코스기", vi: "Musashi-Kosugi" } };
check("mode payload en", disasterModePayload(board, "en").title === "Disaster mode on Musashi-Kosugi");
check("mode payload ja names the board", disasterModePayload(board, "ja").title.includes("武蔵小杉"));
check("mode payload links the board with ?lang=", disasterModePayload(board, "vi").url === "/b/test?lang=vi");
check("mode payload tag per board", disasterModePayload(board, "ko").tag === `mode-${id}`);

// --- which subscriptions the route accepts -------------------------------------------------

check("endpoint: FCM", isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:def"));
check("endpoint: Mozilla", isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA"));
check("endpoint: Apple", isPushEndpoint("https://web.push.apple.com/QGx"));
check("endpoint: WNS", isPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x"));
check("endpoint: http refused", !isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"));
check("endpoint: other host refused", !isPushEndpoint("https://example.com/push"));
check("endpoint: lookalike host refused", !isPushEndpoint("https://fcm.googleapis.com.evil.example/x"));
check("endpoint: private address refused", !isPushEndpoint("https://169.254.169.254/latest"));
check("endpoint: explicit port refused", !isPushEndpoint("https://fcm.googleapis.com:8443/x"));
check("endpoint: credentials refused", !isPushEndpoint("https://user:pw@fcm.googleapis.com/x"));
check("endpoint: over 1024 characters refused", !isPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(1100)}`));

const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
const auth = Buffer.alloc(16, 9).toString("base64url");
check("keys: a P-256 point and a 16 byte secret", validKeys(p256dh, auth));
check("keys: short point refused", !validKeys(Buffer.alloc(33, 4).toString("base64url"), auth));
check("keys: compressed point refused", !validKeys(Buffer.concat([Buffer.from([2]), Buffer.alloc(64, 7)]).toString("base64url"), auth));
check("keys: long secret refused", !validKeys(p256dh, Buffer.alloc(32, 9).toString("base64url")));
check("keys: not base64url refused", !validKeys("not base64!", auth));

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
