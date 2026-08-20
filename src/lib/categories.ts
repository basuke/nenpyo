/**
 * カテゴリの表示ラベル。
 *
 * **暫定**。`category` / `subcategory` は元データ（sf-tech-lifeline）の
 * グルーピングを失わずに取り込むための一時的な入れ物であり、
 * このラベル表もそのデータセットに固有のもの。
 *
 * MVP の問い「カテゴリは独立したタイムラインに分けるべきか、タグ的な属性に
 * 留めるべきか」の答えが出たら、この表ごと消える想定でいる。
 * 知らないキーはキーのまま表示して、落とさない。
 */

type CategoryStyle = { label: string; color: string };

const CATEGORIES: Record<string, CategoryStyle> = {
  sf: { label: "SF作品", color: "#c2452d" },
  tech: { label: "実テクノロジー", color: "#1e5fa8" },
  music: { label: "音楽・カルチャー", color: "#7a3f9d" },
};

const SUBCATEGORIES: Record<string, string> = {
  pc: "コンピューター",
  ai: "AI",
  net: "ネット・インフラ",
  sns: "SNS・ネット文化",
  mobile: "モバイル・通信",
  game: "ゲーム",
  inst: "楽器・DTM",
  audio: "オーディオ",
  video: "映像・カメラ・CG",
  wear: "ウェアラブル",
  tablet: "タブレット・電子書籍",
  xr: "VR・AR",
  robot: "ロボット",
  space: "宇宙・測位",
  quantum: "量子",
  boom: "ブーム・社会現象",
  other: "その他",
  artist_w: "洋楽アーティスト",
  artist_j: "邦楽アーティスト",
};

export function categoryLabel(key: string | null): string | null {
  if (!key) return null;
  return CATEGORIES[key]?.label ?? key;
}

export function categoryColor(key: string | null): string {
  if (!key) return "var(--muted)";
  return CATEGORIES[key]?.color ?? "var(--muted)";
}

export function subcategoryLabel(key: string | null): string | null {
  if (!key) return null;
  return SUBCATEGORIES[key] ?? key;
}
