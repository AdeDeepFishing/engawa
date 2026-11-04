import type { Lang } from "@/lib/i18n";

/**
 * The 47 prefectures with their JIS code (the first two digits of every
 * 町丁目 code a board carries in `area_names`), the id of their outline in
 * japan-map-paths.ts, and their names in the five UI languages. Kept here
 * rather than in the message files: it is reference data, not UI copy.
 */
export interface Prefecture {
  code: string;
  id: string;
  names: Record<Lang, string>;
}

const P = (code: string, id: string, ja: string, en: string, zh: string, ko: string, vi: string): Prefecture => ({
  code,
  id,
  names: { ja, en, zh, ko, vi },
});

export const PREFECTURES: Prefecture[] = [
  P("01", "hokkaido", "北海道", "Hokkaido", "北海道", "홋카이도", "Hokkaido"),
  P("02", "aomori", "青森県", "Aomori", "青森县", "아오모리현", "Aomori"),
  P("03", "iwate", "岩手県", "Iwate", "岩手县", "이와테현", "Iwate"),
  P("04", "miyagi", "宮城県", "Miyagi", "宫城县", "미야기현", "Miyagi"),
  P("05", "akita", "秋田県", "Akita", "秋田县", "아키타현", "Akita"),
  P("06", "yamagata", "山形県", "Yamagata", "山形县", "야마가타현", "Yamagata"),
  P("07", "fukushima", "福島県", "Fukushima", "福岛县", "후쿠시마현", "Fukushima"),
  P("08", "ibaraki", "茨城県", "Ibaraki", "茨城县", "이바라키현", "Ibaraki"),
  P("09", "tochigi", "栃木県", "Tochigi", "栃木县", "도치기현", "Tochigi"),
  P("10", "gunma", "群馬県", "Gunma", "群马县", "군마현", "Gunma"),
  P("11", "saitama", "埼玉県", "Saitama", "埼玉县", "사이타마현", "Saitama"),
  P("12", "chiba", "千葉県", "Chiba", "千叶县", "지바현", "Chiba"),
  P("13", "tokyo", "東京都", "Tokyo", "东京都", "도쿄도", "Tokyo"),
  P("14", "kanagawa", "神奈川県", "Kanagawa", "神奈川县", "가나가와현", "Kanagawa"),
  P("15", "niigata", "新潟県", "Niigata", "新潟县", "니가타현", "Niigata"),
  P("16", "toyama", "富山県", "Toyama", "富山县", "도야마현", "Toyama"),
  P("17", "ishikawa", "石川県", "Ishikawa", "石川县", "이시카와현", "Ishikawa"),
  P("18", "fukui", "福井県", "Fukui", "福井县", "후쿠이현", "Fukui"),
  P("19", "yamanashi", "山梨県", "Yamanashi", "山梨县", "야마나시현", "Yamanashi"),
  P("20", "nagano", "長野県", "Nagano", "长野县", "나가노현", "Nagano"),
  P("21", "gifu", "岐阜県", "Gifu", "岐阜县", "기후현", "Gifu"),
  P("22", "shizuoka", "静岡県", "Shizuoka", "静冈县", "시즈오카현", "Shizuoka"),
  P("23", "aichi", "愛知県", "Aichi", "爱知县", "아이치현", "Aichi"),
  P("24", "mie", "三重県", "Mie", "三重县", "미에현", "Mie"),
  P("25", "shiga", "滋賀県", "Shiga", "滋贺县", "시가현", "Shiga"),
  P("26", "kyoto", "京都府", "Kyoto", "京都府", "교토부", "Kyoto"),
  P("27", "osaka", "大阪府", "Osaka", "大阪府", "오사카부", "Osaka"),
  P("28", "hyogo", "兵庫県", "Hyogo", "兵库县", "효고현", "Hyogo"),
  P("29", "nara", "奈良県", "Nara", "奈良县", "나라현", "Nara"),
  P("30", "wakayama", "和歌山県", "Wakayama", "和歌山县", "와카야마현", "Wakayama"),
  P("31", "tottori", "鳥取県", "Tottori", "鸟取县", "돗토리현", "Tottori"),
  P("32", "shimane", "島根県", "Shimane", "岛根县", "시마네현", "Shimane"),
  P("33", "okayama", "岡山県", "Okayama", "冈山县", "오카야마현", "Okayama"),
  P("34", "hiroshima", "広島県", "Hiroshima", "广岛县", "히로시마현", "Hiroshima"),
  P("35", "yamaguchi", "山口県", "Yamaguchi", "山口县", "야마구치현", "Yamaguchi"),
  P("36", "tokushima", "徳島県", "Tokushima", "德岛县", "도쿠시마현", "Tokushima"),
  P("37", "kagawa", "香川県", "Kagawa", "香川县", "가가와현", "Kagawa"),
  P("38", "ehime", "愛媛県", "Ehime", "爱媛县", "에히메현", "Ehime"),
  P("39", "kochi", "高知県", "Kochi", "高知县", "고치현", "Kochi"),
  P("40", "fukuoka", "福岡県", "Fukuoka", "福冈县", "후쿠오카현", "Fukuoka"),
  P("41", "saga", "佐賀県", "Saga", "佐贺县", "사가현", "Saga"),
  P("42", "nagasaki", "長崎県", "Nagasaki", "长崎县", "나가사키현", "Nagasaki"),
  P("43", "kumamoto", "熊本県", "Kumamoto", "熊本县", "구마모토현", "Kumamoto"),
  P("44", "oita", "大分県", "Oita", "大分县", "오이타현", "Oita"),
  P("45", "miyazaki", "宮崎県", "Miyazaki", "宫崎县", "미야자키현", "Miyazaki"),
  P("46", "kagoshima", "鹿児島県", "Kagoshima", "鹿儿岛县", "가고시마현", "Kagoshima"),
  P("47", "okinawa", "沖縄県", "Okinawa", "冲绳县", "오키나와현", "Okinawa"),
];

/**
 * The prefecture a board belongs to: the JIS code most of its 町丁目 codes
 * start with. Null for a board without area codes, which then has no place
 * on the map (it is still listed).
 */
export function prefectureOfBoard(areas: { code: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const a of areas) {
    const pref = a.code && /^\d{2}/.test(a.code) ? a.code.slice(0, 2) : null;
    if (pref) counts.set(pref, (counts.get(pref) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [code, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = code;
  return best;
}
