// Content of the rendered demo inputs in fixtures/demo/<board>/, from which
// the sample cards of the five newer boards were made through the real
// pipeline (fixtures/demo/README.md). Everything here is fictional: the
// neighbourhood associations, management associations and shopping street
// associations, the events, the people and the phone number. Place names
// are real public places from each board's known_places in
// supabase/seed/boards.json, so that place matching is exercised.
//
// Unlike the fixtures in specs.mjs, these notices carry no 訓練用 stamp
// (`stamp: false`): they announce ordinary peacetime events of fictional
// associations, and the stamp would end up in the card text. Still no crest,
// logo or phone number on any notice, and no app name or trademark in the
// chat screenshot. No em dashes or en dashes; ranges use the wave dash 〜.

// ------------------------------------------------------------ paper notices

export const notices = [
  {
    id: "sh1",
    board: "shibuya",
    file: "sh1-fire-watch-notice",
    style: "formal",
    stamp: false,
    date: "2026年11月2日",
    to: "町会の皆さまへ",
    title: "夜回りのお知らせ",
    intro:
      "秋の火災予防運動にあわせて、町会の防災部で夜回りを行います。\n拍子木を打ちながら「火の用心」と声をかけて、町内をひと回りします。\nどなたでも参加できます。お気軽にお越しください。",
    rows: [
      ["日時", "2026年11月9日（月）〜11月13日（金）\n毎日 19:00〜19:40"],
      ["集合", "神宮通公園 入口"],
      ["持ち物", "懐中電灯（拍子木と腕章は町会で用意します）"],
    ],
    bulletsHeading: "お願い",
    bullets: [
      "雨の日は中止します。中止のときは町会の掲示板でお知らせします。",
      "小学生以下のお子さんは、保護者の方と一緒に参加してください。",
      "歩きやすい靴でお越しください。",
    ],
    footer: ["みずき町会 防災部"],
    photo: { rotate: 1.4, tiltX: -2, tiltY: 2, seed: 61, wall: "#D8D6D0", dx: 6, dy: -4, light: 125 },
  },
  {
    id: "ue1",
    board: "ueno",
    file: "ue1-water-drill-notice",
    style: "shelter",
    stamp: false,
    band: "こもれび町会 防災部からのお知らせ",
    title: "給水訓練のお知らせ",
    rows: [
      ["日時", "11月15日（日）\n10:00〜11:00"],
      ["場所", "上野恩賜公園\n給水ステーション前"],
    ],
    bullets: [
      "災害のときに水を受け取る手順を、町会のみんなで練習します。",
      "給水袋（6リットル）は町会で用意します。数に限りがあります。",
      "小雨決行、荒天の場合は中止します。",
      "申し込みはいりません。どなたでも参加できます。",
    ],
    footer: ["こもれび町会 防災部"],
    photo: { rotate: -1.5, tiltX: 2.5, tiltY: -2, seed: 67, wall: "#DAD7CF", dx: -8, dy: 8, light: 140 },
  },
  {
    id: "mz1",
    board: "mizonokuchi",
    file: "mz1-shelter-drill-notice",
    style: "formal",
    stamp: false,
    date: "2026年10月30日",
    to: "ひばり町内会 会員の皆さまへ",
    title: "避難所開設訓練のお知らせ",
    intro:
      "大きな地震に備えて、避難所となる高津小学校で、避難所を開く手順を確かめる訓練を行います。\n町内会の皆さまのご参加をお願いいたします。",
    rows: [
      ["日時", "2026年11月21日（土）\n9:00〜11:30"],
      ["場所", "川崎市立高津小学校 体育館"],
      ["内容", "受付の設営、間仕切りと段ボールベッドの組み立て、備蓄品の確認"],
    ],
    bulletsHeading: "ご案内",
    bullets: [
      "動きやすい服装と上履きでお越しください。",
      "雨の日も体育館で行います。",
      "小さなお子さま連れでも参加できます。",
      "当日の受付は 8:45 から体育館入口で行います。",
    ],
    footer: ["ひばり町内会 防災部"],
    photo: { rotate: -1.2, tiltX: 2, tiltY: 2.5, seed: 71, wall: "#D3D3CF", dx: -4, dy: 4, light: 130 },
  },
  {
    id: "sp1",
    board: "sapporo",
    file: "sp1-winter-shelter-notice",
    style: "shelter",
    stamp: false,
    band: "すずらん町内会からのお知らせ",
    label: "冬の防災",
    title: "冬の避難所体験会",
    rows: [
      ["日時", "11月21日（土）\n10:00〜12:00"],
      ["場所", "資生館小学校 体育館"],
    ],
    bullets: [
      "寒い季節に避難所で過ごす体験をします。段ボールベッドと毛布の使い方を確かめます。",
      "雪道で転ばない歩き方と、冬靴の選び方のお話もあります。",
      "暖かい服装でお越しください。",
      "申し込みはいりません。どなたでも参加できます。",
    ],
    footer: ["すずらん町内会 防災部"],
    photo: { rotate: 1.7, tiltX: -2.5, tiltY: 1.5, seed: 79, wall: "#DDDBD6", dx: 10, dy: -6, light: 150 },
  },
  {
    id: "hk1",
    board: "hakata",
    file: "hk1-pipe-work-outage-notice",
    style: "formal",
    stamp: false,
    date: "2026年11月2日",
    to: "居住者の皆さまへ",
    title: "断水のお知らせ",
    intro:
      "建物の給水管を新しくする工事を行います。\n作業中は建物全体で断水となります。\nご不便をおかけしますが、ご協力をお願いいたします。",
    rows: [
      ["日時", "2026年11月17日（火）\n10:00〜14:00"],
      ["作業内容", "給水管の更新工事"],
      ["対象", "全住戸、1階店舗"],
    ],
    bulletsHeading: "ご注意ください",
    bullets: [
      "作業中は水道が使えません。トイレも流せません。",
      "前日までに飲み水と生活用水をくみ置きしてください。",
      "断水が終わった直後は、にごった水が出ることがあります。しばらく流してからお使いください。",
    ],
    footer: ["管理組合 理事会", "管理員室（1階）"],
    photo: { rotate: -1.6, tiltX: 3, tiltY: -1.5, seed: 83, wall: "#D6D4CE", dx: -10, dy: 2, light: 120 },
  },
];

// ---------------------------------------------------- chat and post screens

export const chats = [
  {
    id: "sh3",
    board: "shibuya",
    file: "sh3-line-cleanup",
    style: "line",
    statusTime: "18:21",
    title: "道玄坂 ご近所",
    members: 27,
    people: {
      "森 さやか": { glyph: "initial" },
      こうじ: { glyph: "mountain" },
      "井上 直樹": { glyph: "initial" },
      はるな: { glyph: "flower" },
    },
    messages: [
      { date: "11月4日(水)" },
      { from: "森 さやか", time: "18:02", text: "商店会さんから連絡です。11月21日（土）の朝8時から9時まで、道玄坂の歩道の清掃をします" },
      { from: "森 さやか", time: "18:03", text: "集合は渋谷駅のハチ公前広場です。軍手とごみ袋は商店会で用意してくれるそうです" },
      { from: "こうじ", time: "18:06", text: "参加します！" },
      { from: "はるな", time: "18:09", text: "子ども連れでも大丈夫ですか？" },
      { from: "森 さやか", time: "18:11", text: "大丈夫だそうです🙆‍♀️" },
      { from: "井上 直樹", time: "18:14", text: "{name:森}さん、さっきの件あとで電話します。{phone:090-1234-0521} で合ってますか？" },
      { self: true, time: "18:19", read: 4, text: "ありがとうございます、家族で行きます" },
    ],
  },
];
