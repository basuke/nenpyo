// Issue #6 — 末尾の括弧を tagline（読み）と事実補足に振り分ける提案を作る。
//
//   pnpm data:propose-taglines  → curation/taglines.json
//
// 586 件を人力で一件ずつ裁くのは現実的でないので、規則で提案を作り、
// 自信のないものに confidence:"low" を立てて人が見るところを絞る。
// 出力は生成物ではなく「たたき台」で、手で直したものが正となる。
// 一度作ったら再生成せず、curation/taglines.json を直接編集すること。
//
// 判定の土台は #7 で裏を取った「括弧が末尾にあるものだけが読みでありうる」。
// そのうえで、末尾の括弧の中をさらに事実と読みに分ける。

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "curation", "taglines.json");

// 出力先には手で直したものが入っている。うっかり流して消さないように止める。
// 規則を変えて作り直したいときだけ --force を付ける（当然、手直しは消える）。
if (existsSync(OUTPUT) && !process.argv.includes("--force")) {
  console.error(`${path.relative(ROOT, OUTPUT)} は既にある。`);
  console.error("手で直したものが入っているので上書きしない。作り直すなら --force。");
  process.exit(1);
}

/* ── 判定の規則 ───────────────────────────────────────────────────────── */

// 括弧の中が「。」で区切られていたら、前半が事実・後半が読みという書き方が
// 多い。例:「サザランド。GUI・CADの祖」「東芝。日本語ワープロ第一号」。
// 分けてから片方ずつ見る。
const splitSegments = (inner) => inner.split("。").map((s) => s.trim()).filter(Boolean);

// 年や日付の補足。「元年」は読みなので外す。
const isDate = (s) => !/元年/.test(s) && /\d{2,4}年|[〜～]\d|同年|翌年|\d+月|\d+日/.test(s);

// 人名・組織・企業。末尾がこれらなら、その出来事を誰がやったかの補足。
const ORG_TAIL = /(研究所|研|大学|大|社|省|庁|公社|工房|スタジオ|学会|チーム|ら)$/;
const KATAKANA_NAME = /^[ァ-ヶーA-Za-z]+([・=][ァ-ヶーA-Za-z.]+)+$/;
const KANJI_NAME = /^[一-龥]{2,4}[ 　]?[一-龥]{0,3}$/;

// 読みだと分かる言い回し。「〜の誕生」「〜の祖」のたぐいは、
// 出来事そのものではなく、後から振り返って与えた位置づけ。
const READING_TAIL =
  /(の誕生|の始まり|の祖|の原点|の代名詞|の発明|の開幕|の幕開け|の完成形|の決定版|の象徴|の本流|の起点|元年|ブーム|革命|衝撃|爆発|時代|という)/;
const PARTICLE = /[がをにへとはのやで]/;
const VERB_END = /(する|した|なる|なった|ない|れる|られる|せる|できる|いる|ある|だ|た|る|い)$/;

/** 括弧の中の 1 区切りが事実補足か読みか。 */
function classifySegment(s) {
  if (isDate(s)) return { kind: "fact", why: "年・日付の補足" };
  if (KATAKANA_NAME.test(s)) return { kind: "fact", why: "人名" };
  if (ORG_TAIL.test(s) && !PARTICLE.test(s)) return { kind: "fact", why: "組織・企業" };
  if (KANJI_NAME.test(s) && s.length <= 5 && !READING_TAIL.test(s)) return { kind: "fact", why: "人名" };
  if (/^[A-Za-z0-9 .\-+/'&]+$/.test(s) && s.length <= 14) return { kind: "fact", why: "製品名・略称" };
  if (READING_TAIL.test(s)) return { kind: "tagline", why: "位置づけを与える言い回し" };
  if (PARTICLE.test(s) && VERB_END.test(s)) return { kind: "tagline", why: "文になっている" };
  if (PARTICLE.test(s) && s.length >= 6) return { kind: "tagline", why: "助詞を含む句" };
  return { kind: "fact", why: "名詞の並び" };
}

// 規則では割り切れず、目で見て決めたもの。規則を複雑にするより、
// 例外として名指しするほうが後から読める。括弧の中身をそのまま鍵にする。
const OVERRIDE = {
  // 名詞の並びに見えるが、出来事への位置づけになっている
  "車から飛び立つ偵察ドローン": "tagline",
  "ID乗っ取りスリラー": "tagline",
  "撮ってすぐ見られる": "tagline",
  "しゃべって歌うパソコン": "tagline",
  "会話するクルマKITT": "tagline",
  "グラフィック強化された続編": "tagline",
  "腕時計型コンピューター": "tagline",
  "パソコンテレビ": "tagline",
  "レーザーディスクゲーム": "tagline",
  "実用的なプログラム内蔵式計算機": "tagline",
  "商用コンピューター第1号": "tagline",
  "掃除するアンドロイド": "tagline",
  "16ビット機戦争": "tagline",
  "いちばん売れたシンセサイザー": "tagline",
  "オープンなスマホ": "tagline",
  "再使用ロケット": "tagline",
  "遠隔操縦される戦争": "tagline",
  "匿名掲示板文化": "tagline",
  "演奏しない音楽": "tagline",
  "実在しないアイドル": "tagline",
  "人間より人間らしい": "tagline",
  "日本初のマイコン専門誌": "tagline",
  "72秒間の未解決": "tagline",
  // タイトルのほうが読みで、括弧が事実という逆転
  "車載AIアシスタント": "fact",
  "ゼロショット音声合成": "fact",
  // 規則が読みと見たが、実際は事実の補足
  "音楽はキース・エマーソン": "fact",
  "表紙は川原由美子": "fact",
  "原作は2009年刊行": "fact",
  "未来編を映像化": "fact",
  "日本は63年頃": "fact",
  "日本は同年11月": "fact",
  "のちのファミ通へ": "fact",
  "のちのユーミン": "fact",
  "のちのピクサー": "fact",
  "ジョブズが買収": "fact",
  "ILMのノール兄弟が作った": "fact",
  "アラン・ケイの論文発表": "fact",
  "電子メールで@記号が使われる": "fact",
  "日本版の顔はイルカのカイル": "fact",
  "社名はアシモフのロボット会社から": "fact",
  "Facebookの社名変更": "fact",
  "「警官のひげは半分構築」で計算機著作を主張": "fact",
  "短編「堂々めぐり」で明文化": "fact",
  "EYE-COMから週刊へ": "fact",
  "モーションコントロール・カメラの開発": "fact",
  "みんなのうた": "fact",
  // low を一件ずつ見て直したぶん
  "日本語ワープロ第一号": "tagline",
  "コープの自動作曲AI": "fact",
  "会話する人工無脳": "tagline",
  "ネット書店から始まった": "tagline",
  "のちの「伺か」": "fact",
  "デスクトップ対話エージェント文化": "tagline",
  "日本初、そしてピンポイント着陸": "tagline",
  "映像も破られた": "tagline",
  "コードも操作も委任": "tagline",
};

/* ── 対象を組み立てる ─────────────────────────────────────────────────── */

const source = JSON.parse(await readFile(path.join(ROOT, "data", "sf-tech-lifeline.json"), "utf8"));
const slash = JSON.parse(await readFile(path.join(ROOT, "curation", "slash.json"), "utf8"));
const events = Object.values(source.byCategory).flat();
const splitBySlash = new Map(
  slash.items.filter((item) => item.disposition !== "keep").map((item) => [item.title, item]),
);

const items = [];
for (const event of events) {
  const item = splitBySlash.get(event.title);
  const titles = item ? item.events.map((child) => child.title) : [event.title];
  for (const title of titles) {
    const match = title.match(/^(.*?)\(([^()]*)\)\s*$/);
    if (!match) continue;

    const [, stem, inner] = match;
    const segments = splitSegments(inner);
    const judged = segments.map((segment) => {
      const forced = OVERRIDE[segment];
      const guess = classifySegment(segment);
      return {
        text: segment,
        kind: forced ?? guess.kind,
        why: forced ? "目視で判断" : guess.why,
        overridden: Boolean(forced),
      };
    });

    const facts = judged.filter((s) => s.kind === "fact").map((s) => s.text);
    const taglines = judged.filter((s) => s.kind === "tagline").map((s) => s.text);

    // 事実だけが残るならタイトルは元のまま。読みが混ざるときだけ組み替える。
    const newTitle = facts.length ? `${stem}(${facts.join("。")})` : stem.trimEnd();

    // 人が見るべきなのは、規則が決めきれなかったものだけ。
    // 目視で決めた例外はもう答えが出ているので high のままでよい。
    //
    //   「名詞の並び」… どの規則にも当たらなかった受け皿。いちばん怪しい
    //   事実と読みが混在  … 「。」で割った結果。切り方が妥当か見る値打ちがある
    const low =
      judged.some((s) => s.why === "名詞の並び") || (facts.length > 0 && taglines.length > 0);

    items.push({
      title,
      year: event.year,
      category: event.category,
      from: item ? event.title : null,
      newTitle,
      tagline: taglines.join("。") || null,
      segments: judged.map(({ text, kind, why }) => ({ text, kind, why })),
      confidence: low ? "low" : "high",
    });
  }
}

const doc = {
  $comment: [
    "Issue #6 — 末尾の括弧を tagline（読み）と事実補足に振り分けた表。",
    "元データ: data/sf-tech-lifeline.json (matsuo-koya/sf-tech-lifeline @ ad94155)",
    "",
    "scripts/propose-taglines.mjs が作った提案を出発点に、手で直したもの。",
    "**再生成しないこと。** 直すときはこのファイルを直接編集する。",
    "",
    "newTitle … 分解後のイベントのタイトル（events.title に入る）",
    "tagline  … 切り出した読み（notes.tagline に入る）。無ければ null",
    "segments … 括弧の中を「。」で割って一つずつ判定した内訳",
    "confidence … low のものは目視の確認が要る",
  ],
  items,
};

await writeFile(OUTPUT, JSON.stringify(doc, null, 2) + "\n");

const counts = { high: 0, low: 0 };
for (const item of items) counts[item.confidence] += 1;
console.log(`${items.length} 件`);
console.log(`  tagline あり ${items.filter((i) => i.tagline).length} / 事実補足のみ ${items.filter((i) => !i.tagline).length}`);
console.log(`  confidence: high ${counts.high} / low ${counts.low}`);
