/**
 * Checks the board mode rules (N21) that need no API and no database: which
 * card from the official inbox switches a board to disaster, when a disaster
 * board is due for the auto return, and the list order in disaster mode.
 *
 *   pnpm check:mode
 *
 * Exits 1 when a check fails. The broadcast texts are written here in the
 * style of the city's mail; they are fictional.
 */
import {
  autoReturnDue,
  disasterOrder,
  emergencyTerm,
  reasonKind,
  switchesToDisaster,
  type EmergencyInput,
} from "../lib/cards/mode";
import type { Card, Category, SourceType } from "../lib/types";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

const fact = (category: Category, titleJa: string, bodyJa: string, sourceType: SourceType = "official"): EmergencyInput => ({
  category,
  source_type: sourceType,
  title: { ja: titleJa },
  body: { ja: bodyJa },
  original_excerpt: "",
});

const evacuation = fact(
  "official_notice",
  "中原区に避難指示",
  "警戒レベル4、避難指示を発令しました。小杉小学校に避難所を開設しています。",
);
const publicCreate = { action: "create" as const, visibility: "public" as const };

// --- the emergency words ---------------------------------------------------------

check("term: 避難指示 in an official notice", emergencyTerm(evacuation) === "避難指示");
check("term: 警戒レベル4 written with a full-width digit and a space", emergencyTerm(fact("danger", "大雨", "警戒 レベル４ に相当します")) === "警戒レベル4/5");
check("term: 緊急安全確保", emergencyTerm(fact("danger", "緊急安全確保", "直ちに身の安全を確保してください")) === "緊急安全確保");
check("term: 大津波警報 counts as 津波警報", emergencyTerm(fact("danger", "大津波警報", "沿岸から離れてください")) === "津波警報");
check("term: 震度5弱", emergencyTerm(fact("official_notice", "地震情報", "川崎市中原区で震度5弱を観測しました")) === "震度5弱+");
check("term: 震度６強 with a full-width digit", emergencyTerm(fact("official_notice", "地震情報", "震度６強")) === "震度5弱+");
check("term: 大雨特別警報", emergencyTerm(fact("danger", "大雨特別警報", "命を守る行動をとってください")) === "特別警報");
check("term: 避難命令 in the source excerpt only", emergencyTerm({ ...fact("official_notice", "お知らせ", "避難してください"), original_excerpt: "避難命令が出ました" }) === "避難命令");

check("no term: an earthquake report saying there is no tsunami concern", emergencyTerm(fact("official_notice", "地震情報", "震度3を観測しました。この地震による津波の心配はありません。")) === null);
check("no term: 震度4", emergencyTerm(fact("official_notice", "地震情報", "震度4を観測しました")) === null);
check("no term: 警戒レベル3 高齢者等避難", emergencyTerm(fact("official_notice", "高齢者等避難", "警戒レベル3、高齢者等避難を発令しました")) === null);
check("no term: a heat alert", emergencyTerm(fact("danger", "熱中症警戒アラート", "こまめに水分をとってください")) === null);
check("no term: a photochemical smog advisory", emergencyTerm(fact("danger", "光化学スモッグ注意報", "屋外での運動を控えてください")) === null);
check("no term: the evacuation order lifted (解除 in the title)", emergencyTerm(fact("official_notice", "避難指示の解除", "避難指示を解除しました")) === null);
check("no term: a drill (訓練 in the title)", emergencyTerm(fact("official_notice", "避難訓練のお知らせ", "当日は避難指示の放送を行います")) === null);
check("no term: a drill named only in the body (訓練)", emergencyTerm(fact("official_notice", "避難指示", "これは訓練放送です。警戒レベル4、避難指示を発令しました。")) === null);
check("no term: a scenario named only in the body (想定)", emergencyTerm(fact("official_notice", "地震情報", "震度6強の地震を想定し、避難指示の放送を行います。")) === null);
check("no term: a drill named only in the source excerpt", emergencyTerm({ ...fact("official_notice", "お知らせ", "避難指示を発令しました"), original_excerpt: "【訓練】避難指示を発令しました" }) === null);
check("term: 訓練ではありません in the body still switches", emergencyTerm(fact("official_notice", "避難指示", "これは訓練ではありません。警戒レベル4、避難指示を発令しました。")) === "避難指示");
check("term: 洪水浸水想定区域 in the body still switches", emergencyTerm(fact("official_notice", "避難指示", "多摩川の洪水浸水想定区域に避難指示を発令しました。")) === "避難指示");
check("term: 浸水が想定される in the body still switches", emergencyTerm(fact("danger", "大雨特別警報", "浸水が想定される地域の方は直ちに避難してください。")) === "特別警報");
check("term: これは訓練ではございません still switches", emergencyTerm(fact("official_notice", "避難指示", "これは訓練ではございません。避難指示を発令しました。")) === "避難指示");
check("term: 訓練ではなく、実際の避難指示です still switches", emergencyTerm(fact("official_notice", "避難指示", "訓練ではなく、実際の避難指示です。直ちに避難してください。")) === "避難指示");
check("term: これは訓練放送ではありません still switches", emergencyTerm(fact("official_notice", "避難指示", "これは訓練放送ではありません。警戒レベル4、避難指示を発令しました。")) === "避難指示");
check("term: a cancelled drill mentioned in passing still switches", emergencyTerm(fact("official_notice", "避難指示", "避難指示を発令しました。なお本日予定の防災訓練は中止します。")) === "避難指示");
check("term: 浸水が想定されている地域 still switches", emergencyTerm(fact("official_notice", "避難指示", "浸水が想定されている地域に避難指示を発令しました。")) === "避難指示");
check("term: 想定以上の降雨 still switches", emergencyTerm(fact("danger", "大雨", "想定以上の降雨により、警戒レベル4、避難指示を発令しました。")) === "避難指示");
check("term: 想定外の水位上昇 still switches", emergencyTerm(fact("danger", "河川情報", "想定外の水位上昇のため、緊急安全確保を発令しました。")) === "緊急安全確保");
check("no term: 訓練を実施します in the body", emergencyTerm(fact("official_notice", "お知らせ", "本日、避難指示の発令を想定した訓練を実施します。")) === null);
check("term: 解除 in the body only does not block (解除されるまで)", emergencyTerm(fact("official_notice", "避難指示", "警戒レベル4、避難指示を発令しました。解除されるまで避難所にとどまってください。")) === "避難指示");
check("term: an evacuation order filed as shelter", emergencyTerm({ ...evacuation, category: "shelter" }) === "避難指示");
check("no term: a shelter opening without an order", emergencyTerm(fact("shelter", "避難所の開設", "小杉小学校を避難所として開設しました")) === null);
check("no term: an evacuation order filed as transport", emergencyTerm({ ...evacuation, category: "transport" }) === null);
check("no term: a water point", emergencyTerm(fact("water", "給水所", "小杉小学校で給水を行います")) === null);

// --- who may switch the board ----------------------------------------------------

check("switch: official city mail, public create", switchesToDisaster(evacuation, "city_mail", publicCreate) === "避難指示");
check("switch: official city mail, merge and update", switchesToDisaster(evacuation, "city_mail", { action: "merge", visibility: "public" }) !== null && switchesToDisaster(evacuation, "city_mail", { action: "update", visibility: "public" }) !== null);
check("no switch: a secondhand source saying the same", switchesToDisaster({ ...evacuation, source_type: "secondhand" }, "loudspeaker", publicCreate) === null);
check("no switch: a firsthand source saying the same", switchesToDisaster({ ...evacuation, source_type: "firsthand" }, "other", publicCreate) === null);
check("no switch: official, but not from the city's mail (a paper notice)", switchesToDisaster(evacuation, "paper", publicCreate) === null);
check("no switch: a held card", switchesToDisaster(evacuation, "city_mail", { action: "hold", visibility: "held" }) === null);
check("no switch: a conflict leaves the card as it was", switchesToDisaster(evacuation, "city_mail", { action: "conflict", visibility: "public" }) === null);

// --- reasons and the auto return -------------------------------------------------

check("reason: inbox:<id> is shown as inbox, without the id", reasonKind("inbox:6f1d2c4e-0000-4000-8000-000000000000") === "inbox");
check("reason: admin and auto_return pass through, anything else is unknown", reasonKind("admin") === "admin" && reasonKind("auto_return") === "auto_return" && reasonKind(null) === null && reasonKind("other") === null);
const now = new Date("2026-11-12T12:00:00+09:00");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
check("auto return: due 8 days after the switch", autoReturnDue({ mode: "disaster", since: daysAgo(8) }, now));
check("auto return: not due 6 days after the switch", !autoReturnDue({ mode: "disaster", since: daysAgo(6) }, now));
check("auto return: not for a peace board", !autoReturnDue({ mode: "peace", since: daysAgo(30) }, now));
check("auto return: not when the switch time is unknown", !autoReturnDue({ mode: "disaster", since: null }, now));

// --- the list order in disaster mode ---------------------------------------------

type Row = Pick<Card, "pinned" | "source_type" | "category" | "created_at"> & { id: string };
const row = (id: string, category: Category, sourceType: SourceType, createdAt: string, pinned = false): Row => ({
  id,
  category,
  source_type: sourceType,
  created_at: createdAt,
  pinned,
});
const rows: Row[] = [
  row("daily-new", "daily_notice", "secondhand", "2026-11-05T10:00:00Z"),
  row("water-old", "water", "firsthand", "2026-11-05T08:00:00Z"),
  row("water-new", "water", "firsthand", "2026-11-05T09:00:00Z"),
  row("shelter-official", "shelter", "official", "2026-11-05T07:00:00Z"),
  row("danger-official", "danger", "official", "2026-11-05T06:00:00Z"),
  row("food", "food", "secondhand", "2026-11-05T09:30:00Z"),
  row("medical", "medical", "unknown", "2026-11-05T09:45:00Z"),
  row("pinned-daily", "daily_notice", "secondhand", "2026-11-01T00:00:00Z", true),
];
const order = disasterOrder(rows).map((r) => r.id);
check(
  "order: pinned, official (danger before shelter), then danger, water (newest first), shelter, medical, food, supplies, the rest",
  order.join(",") === "pinned-daily,danger-official,shelter-official,water-new,water-old,medical,food,daily-new",
);
check("order: the input is left as it was", rows[0].id === "daily-new");

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
