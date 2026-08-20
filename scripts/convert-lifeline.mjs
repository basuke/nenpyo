// F-7: 松尾公也さんの「SF・コンピューター技術ライフライン」を Event スキーマに変換する。
//
//   出典: https://github.com/matsuo-koya/sf-tech-lifeline (MIT)
//   利用: 共同制作として許諾取得済み（docs/001-mvp.md 8.1）
//
// 元データは src/events.js に構造化済みで置かれているので、スクレイピングは要らない。
// このスクリプトは events.js を取得し、目視確認用の JSON と D1 投入用の SQL を吐く。
//
//   pnpm data:convert
//     → data/sf-tech-lifeline.json  （目視確認用）
//     → data/sf-tech-lifeline.sql   （D1 投入用）
//
// フィールドの対応は docs/001-mvp.md 8.2 の表のとおり。ic / q / a は捨てる。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");

// 再現性のためコミットで固定する。更新したいときはここを差し替える。
const SOURCE_REPO = "matsuo-koya/sf-tech-lifeline";
const SOURCE_COMMIT = "ad94155d0cc5163e539e7cdda14d49e584515a8c";
const SOURCE_URL = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/src/events.js`;

// 投入先。オーナーは松尾さん本人（本人のログイン前でも User 行は存在する）。
const OWNER_USERNAME = "matsuo-koya";

// category ごとに 1 本ずつ。slug は category のキーと揃えてある。
//
// 当初は 720 件を 1 本の混在版として投入していたが、問い 2（カテゴリは独立した
// タイムラインに分けるべきか）を実地で見るために 3 本へ割った。混在版はもう作らない。
//
// TODO: 説明文を書き下ろす。元 README の「生年を入力すると…」はアプリの説明で
// あって年表そのものの説明ではないので流用できない（docs/001-mvp.md 8.4）。
const TIMELINES = {
  sf: {
    slug: "sf",
    title: "SF作品 ライフライン",
    description: "松尾公也「SF・コンピューター技術ライフライン」から SF 作品だけを抜き出した年表。",
  },
  tech: {
    slug: "tech",
    title: "実テクノロジー ライフライン",
    description: "松尾公也「SF・コンピューター技術ライフライン」から実テクノロジーだけを抜き出した年表。",
  },
  music: {
    slug: "music",
    title: "音楽・カルチャー ライフライン",
    description: "松尾公也「SF・コンピューター技術ライフライン」から音楽・カルチャーだけを抜き出した年表。",
  },
};

const DESCRIPTION_SUFFIX = "\n\n※この説明文は仮です（TODO: 書き下ろす）";

// D1 には 1 文あたりの長さの上限がある（超えると SQLITE_TOOBIG）。
// 蘊蓄が最長 1013 字あるので行数ではなくバイト数で刻む。
// あわせて SQLITE_MAX_COMPOUND_SELECT（既定 500）にも掛からないようにする。
const MAX_STATEMENT_BYTES = 48 * 1024;
const MAX_ROWS_PER_STATEMENT = 200;

/** events.js を取得する。一度落としたら data/ にキャッシュする。 */
async function loadSourceEvents() {
  await mkdir(DATA_DIR, { recursive: true });
  const cached = path.join(DATA_DIR, `events.${SOURCE_COMMIT.slice(0, 7)}.js`);

  if (!existsSync(cached)) {
    process.stderr.write(`fetching ${SOURCE_URL}\n`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`failed to fetch source: ${res.status} ${res.statusText}`);
    await writeFile(cached, await res.text(), "utf8");
  }

  const { EVENTS } = await import(`file://${cached}`);
  if (!Array.isArray(EVENTS)) throw new Error("EVENTS is not an array");
  return EVENTS;
}

/** 元データ 1 行 → Event 1 行。分割はせず素直に取り込む。 */
function toEventRow(src) {
  return {
    year: src.y,
    precision: "year", // 元データに月日は一件もない
    title: src.t,
    description: src.n ?? null,
    category: src.cat ?? null,
    subcategory: src.s ?? null,
    // リンクは記法を保ったまま JSON 配列で持つ。展開は表示時に行う。
    links: src.l?.length ? JSON.stringify(src.l) : null,
  };
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined) return "NULL";
  if (!Number.isFinite(value)) throw new Error(`not a finite number: ${value}`);
  return String(value);
}

/** 1 文が長くなりすぎないよう、行をバイト数で刻む。 */
function chunkRows(rows) {
  const chunks = [];
  let current = [];
  let bytes = 0;

  for (const row of rows) {
    const size = Buffer.byteLength(rowValues(row));
    const wouldOverflow = bytes + size > MAX_STATEMENT_BYTES || current.length >= MAX_ROWS_PER_STATEMENT;
    if (current.length && wouldOverflow) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) chunks.push(current);

  return chunks;
}

/** VALUES 1 行分。列順は INSERT の並びに合わせる。 */
function rowValues(row) {
  return [
    sqlNumber(row.year),
    sqlString(row.precision),
    sqlString(row.title),
    sqlString(row.description),
    sqlString(row.category),
    sqlString(row.subcategory),
    sqlString(row.links),
  ].join(", ");
}

function buildSql(byCategory) {
  const owner = sqlString(OWNER_USERNAME);
  const total = Object.values(byCategory).reduce((n, rows) => n + rows.length, 0);

  const out = [];
  out.push("-- 自動生成: pnpm data:convert");
  out.push(`-- 出典 ${SOURCE_REPO} @ ${SOURCE_COMMIT} (MIT)`);
  out.push(`-- ${total} 件を category ごとに ${Object.keys(byCategory).length} 本へ`);
  out.push("--");
  out.push("-- 冪等。流し直すとイベントを入れ替える。");
  out.push("");

  for (const [category, rows] of Object.entries(byCategory)) {
    const timeline = TIMELINES[category];
    const slug = sqlString(timeline.slug);

    out.push(`-- ── ${timeline.title}（${rows.length} 件）`);
    out.push("INSERT OR IGNORE INTO timelines (owner_id, slug, title, description)");
    out.push(
      `SELECT id, ${slug}, ${sqlString(timeline.title)}, ${sqlString(timeline.description + DESCRIPTION_SUFFIX)}`,
    );
    out.push(`  FROM users WHERE username = ${owner};`);
    out.push("");

    out.push("DELETE FROM events WHERE timeline_id IN (");
    out.push("  SELECT t.id FROM timelines t JOIN users u ON u.id = t.owner_id");
    out.push(`   WHERE u.username = ${owner} AND t.slug = ${slug}`);
    out.push(");");
    out.push("");

    for (const chunk of chunkRows(rows)) {
      out.push(
        "INSERT INTO events (timeline_id, year, precision, title, description, category, subcategory, links, created_by)",
      );
      // SQLite の VALUES は列名を付けられないので column1..column7 で受ける。
      out.push(
        "SELECT t.id, v.column1, v.column2, v.column3, v.column4, v.column5, v.column6, v.column7, u.id",
      );
      out.push("  FROM (VALUES");
      chunk.forEach((row, index) => {
        out.push(`    (${rowValues(row)})${index === chunk.length - 1 ? "" : ","}`);
      });
      out.push("  ) AS v");
      out.push(`  JOIN users u ON u.username = ${owner}`);
      out.push(`  JOIN timelines t ON t.owner_id = u.id AND t.slug = ${slug};`);
      out.push("");
    }

    out.push("UPDATE timelines SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    out.push(
      ` WHERE slug = ${slug} AND owner_id = (SELECT id FROM users WHERE username = ${owner});`,
    );
    out.push("");
  }

  return out.join("\n");
}

function report(byCategory) {
  const lines = [];

  for (const [category, rows] of Object.entries(byCategory)) {
    const years = rows.map((r) => r.year);
    const lengths = rows.map((r) => (r.description ?? "").length).sort((a, b) => a - b);
    const links = rows.reduce((sum, r) => sum + (r.links ? JSON.parse(r.links).length : 0), 0);
    const subs = new Set(rows.map((r) => r.subcategory).filter(Boolean));

    lines.push(
      `${TIMELINES[category].slug.padEnd(6)} ${String(rows.length).padStart(4)} 件  ` +
        `${Math.min(...years)}〜${Math.max(...years)}（${new Set(years).size} 年分）  ` +
        `分野 ${subs.size} 種  蘊蓄 中央値 ${lengths[lengths.length >> 1]} 字  リンク ${links} 本`,
    );
  }

  const total = Object.values(byCategory).reduce((n, rows) => n + rows.length, 0);
  lines.push(`合計   ${String(total).padStart(4)} 件`);
  return lines.join("\n");
}

const source = await loadSourceEvents();
const rows = source.map(toEventRow);

// 素通ししてはいけないものだけ弾く。
const broken = rows.filter((r) => !Number.isInteger(r.year) || !r.title);
if (broken.length) {
  throw new Error(`year か title が欠けている行が ${broken.length} 件ある`);
}

// 知らない category が来たら黙って落とさず気づけるようにする。
const unknown = [...new Set(rows.map((r) => r.category).filter((c) => !c || !TIMELINES[c]))];
if (unknown.length) {
  throw new Error(`投入先の決まっていない category がある: ${unknown.join(", ")}`);
}

const byCategory = {};
for (const category of Object.keys(TIMELINES)) byCategory[category] = [];
for (const row of rows) byCategory[row.category].push(row);

await mkdir(DATA_DIR, { recursive: true });
await writeFile(
  path.join(DATA_DIR, "sf-tech-lifeline.json"),
  JSON.stringify({ source: { repo: SOURCE_REPO, commit: SOURCE_COMMIT }, byCategory }, null, 2),
  "utf8",
);
await writeFile(path.join(DATA_DIR, "sf-tech-lifeline.sql"), buildSql(byCategory), "utf8");

process.stdout.write(report(byCategory) + "\n");
process.stdout.write("\n→ data/sf-tech-lifeline.json\n→ data/sf-tech-lifeline.sql\n");
