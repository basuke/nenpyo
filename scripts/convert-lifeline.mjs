// 松尾公也さんの「SF・コンピューター技術ライフライン」を、events / notes /
// timeline_entries へ変換する（docs/003-events-and-notes.md）。
//
//   出典: https://github.com/matsuo-koya/sf-tech-lifeline (MIT)
//   利用: 共同制作として許諾取得済み（docs/001-mvp.md 8.1）
//
// 元データは 1 行が「いつ・何が起きたか」と「それをどう読むか」を混ぜて持って
// いる。分け方の判断は curation/ の 3 つの表にあり、ここには書かない。
// このスクリプトがやるのは、表のとおりに組み替えて SQL にすることだけ。
//
//   curation/slash.json          "/" で繋がれた 47 件を entry へ割る
//   curation/taglines.json       末尾の括弧を title と tagline に分ける
//   curation/inline-parens.json  途中の括弧はタイトルに残す（確認のみ）
//
//   pnpm data:convert
//     → data/sf-tech-lifeline.json  （目視確認用）
//     → data/sf-tech-lifeline.sql   （D1 投入用）
//
// 表と元データが食い違っていたら止まる。pnpm data:check も同じことを見ている。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, DATA_DIR, SOURCE_REPO, SOURCE_COMMIT, loadSourceEvents } from "./source.mjs";

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

/** curation/ の仕分け表を読む。 */
async function loadCuration() {
  const read = async (name) =>
    JSON.parse(await readFile(path.join(ROOT, "curation", name), "utf8"));

  const slash = await read("slash.json");
  const taglines = await read("taglines.json");
  const inlineParens = await read("inline-parens.json");

  return {
    // "/" を含む元タイトル → 割り方
    slash: new Map(slash.items.map((item) => [item.title, item])),
    // 割ったあとのタイトル → title と tagline への分け方
    taglines: new Map(taglines.items.map((item) => [item.title, item])),
    inlineParens,
  };
}

/**
 * 元データ 1 行 → entry 1 つ以上。
 *
 * entry は年表の 1 行で、ノート 1 本と event（出来事）1..N を持つ。
 * 束ねられた行は event が複数になり、無関係な出来事の並置だった行は
 * entry ごと分かれる。
 */
function toEntries(src, curation) {
  const base = {
    year: src.y,
    precision: "year", // 元データに月日は一件もない
    category: src.cat ?? null,
    subcategory: src.s ?? null,
  };
  const links = src.l?.length ? src.l : [];
  const body = src.n ?? null;

  const item = curation.slash.get(src.t);

  // "/" を含まない、あるいは名前の一部だったもの。1 entry / 1 event。
  if (!item || item.disposition === "keep") {
    const { title, tagline } = splitTagline(src.t, curation);
    return [{ ...base, tagline, body, events: [{ ...base, title, links }] }];
  }

  // 無関係な出来事の並置。entry ごと分かれるので、ノートもそれぞれに要る。
  if (item.disposition === "split") {
    return item.events.map((child, index) => {
      const { title, tagline } = splitTagline(child.title, curation);
      return {
        ...base,
        tagline: child.tagline ?? tagline,
        body: child.body ?? null,
        // リンクは元データが行単位でしか持っていないので、先頭の event にまとめる。
        events: [{ ...base, title, links: index === 0 ? links : [] }],
      };
    });
  }

  // 束ね（compound）と、片側がキャッチコピーだったもの（tagline）。1 entry / N event。
  // ノートは束ね全体に掛かるので、entry に 1 本だけ持つ。
  const events = [];
  const readings = item.tagline ? [item.tagline] : [];

  item.events.forEach((child, index) => {
    const { title, tagline } = splitTagline(child.title, curation);
    if (child.tagline) readings.push(child.tagline);
    else if (tagline) readings.push(tagline);
    // 元データのリンクは行単位なので、どの event のものか分からない。
    // 表示は entry がまとめて出すので、代表イベントに載せておく。
    events.push({ ...base, title, links: index === 0 ? links : [] });
  });

  if (readings.length > 1) {
    throw new Error(`entry にキャッチコピーが ${readings.length} 本ある: ${src.t}`);
  }

  return [{ ...base, tagline: readings[0] ?? null, body, events }];
}

/** 末尾の括弧を、タイトルに残すぶんとキャッチコピーに分ける。判断は taglines.json にある。 */
function splitTagline(title, curation) {
  const item = curation.taglines.get(title);
  if (!item) {
    // 末尾に括弧が無ければ表に載っていないのが正しい。あるのに無ければ取りこぼし。
    if (/\([^()]*\)\s*$/.test(title)) {
      throw new Error(`taglines.json に載っていない: ${title}`);
    }
    return { title, tagline: null };
  }
  return { title: item.newTitle, tagline: item.tagline };
}

/* ── SQL ──────────────────────────────────────────────────────────────── */

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
    const size = Buffer.byteLength(row);
    const wouldOverflow =
      bytes + size > MAX_STATEMENT_BYTES || current.length >= MAX_ROWS_PER_STATEMENT;
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

/** VALUES を刻みながら INSERT を並べる。 */
function insertValues(out, table, columns, rows) {
  for (const chunk of chunkRows(rows)) {
    out.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES`);
    chunk.forEach((row, index) => {
      out.push(`  (${row})${index === chunk.length - 1 ? ";" : ","}`);
    });
    out.push("");
  }
}

/**
 * SQL を組み立てる。
 *
 * events / notes / timeline_entries は互いを id で指すが、SQL ファイルを流す
 * だけでは採番された id を受け取れない。そこで作業用の表に通し番号つきで
 * 置いてから、いまの最大 id を足して一括で入れる。
 */
function buildSql(entries) {
  const owner = sqlString(OWNER_USERNAME);
  const slugs = Object.values(TIMELINES).map((t) => sqlString(t.slug)).join(", ");

  const seedEntries = [];
  const seedEvents = [];
  entries.forEach((entry, index) => {
    const entryKey = index + 1;
    seedEntries.push(
      [
        sqlNumber(entryKey),
        sqlString(TIMELINES[entry.category].slug),
        sqlString(entry.tagline),
        sqlString(entry.body),
      ].join(", "),
    );
    entry.events.forEach((event, position) => {
      seedEvents.push(
        [
          sqlNumber(seedEvents.length + 1),
          sqlNumber(entryKey),
          sqlNumber(position),
          sqlNumber(event.year),
          sqlString(event.title),
          sqlString(event.category),
          sqlString(event.subcategory),
          sqlString(event.links.length ? JSON.stringify(event.links) : null),
        ].join(", "),
      );
    });
  });

  const out = [];
  out.push("-- 自動生成: pnpm data:convert");
  out.push(`-- 出典 ${SOURCE_REPO} @ ${SOURCE_COMMIT} (MIT)`);
  out.push(`-- entry ${entries.length} 件 / event ${seedEvents.length} 件`);
  out.push("--");
  out.push("-- 冪等。流し直すとこの 3 本の年表の中身を入れ替える。");
  out.push("");

  out.push("/* ── 作業用の表に、通し番号を振って置く ── */");
  out.push("");
  out.push("DROP TABLE IF EXISTS _seed_entries;");
  out.push("DROP TABLE IF EXISTS _seed_events;");
  out.push("DROP TABLE IF EXISTS _seed_old_entries;");
  out.push("DROP TABLE IF EXISTS _seed_old_events;");
  out.push("DROP TABLE IF EXISTS _seed_base;");
  out.push("");
  out.push("CREATE TABLE _seed_entries (key INTEGER PRIMARY KEY, slug TEXT NOT NULL, tagline TEXT, body TEXT);");
  out.push(
    "CREATE TABLE _seed_events (key INTEGER PRIMARY KEY, entry_key INTEGER NOT NULL, position INTEGER NOT NULL,",
  );
  out.push("  year INTEGER NOT NULL, title TEXT NOT NULL, category TEXT, subcategory TEXT, links TEXT);");
  out.push("");
  insertValues(out, "_seed_entries", ["key", "slug", "tagline", "body"], seedEntries);
  insertValues(
    out,
    "_seed_events",
    ["key", "entry_key", "position", "year", "title", "category", "subcategory", "links"],
    seedEvents,
  );

  out.push("/* ── 年表を用意する ── */");
  out.push("");
  for (const timeline of Object.values(TIMELINES)) {
    out.push("INSERT OR IGNORE INTO timelines (owner_id, slug, title, description)");
    out.push(
      `SELECT id, ${sqlString(timeline.slug)}, ${sqlString(timeline.title)}, ${sqlString(timeline.description + DESCRIPTION_SUFFIX)}`,
    );
    out.push(`  FROM users WHERE username = ${owner};`);
    out.push("");
  }

  out.push("/* ── 前に投入したぶんを落とす ── */");
  out.push("--");
  out.push("-- entry は年表のものなので必ず消える。event と notes は素材なので、");
  out.push("-- どこからも参照されなくなったものだけを回収する（docs/003 の 6 章）。");
  out.push("-- 先に entry を消すと繋ぎが CASCADE で落ちるので、event の控えを先に取る。");
  out.push("");
  out.push("CREATE TABLE _seed_old_entries AS");
  out.push("  SELECT te.id AS entry_id, te.note_id");
  out.push("    FROM timeline_entries te");
  out.push("    JOIN timelines t ON t.id = te.timeline_id");
  out.push("    JOIN users u ON u.id = t.owner_id");
  out.push(`   WHERE u.username = ${owner} AND t.slug IN (${slugs});`);
  out.push("");
  out.push("CREATE TABLE _seed_old_events AS");
  out.push("  SELECT DISTINCT tee.event_id");
  out.push("    FROM timeline_entry_events tee");
  out.push("    JOIN _seed_old_entries o ON o.entry_id = tee.entry_id;");
  out.push("");
  out.push("DELETE FROM timeline_entries WHERE id IN (SELECT entry_id FROM _seed_old_entries);");
  out.push("");
  out.push("DELETE FROM events");
  out.push("      WHERE id IN (SELECT event_id FROM _seed_old_events)");
  out.push("        AND NOT EXISTS (SELECT 1 FROM timeline_entry_events WHERE event_id = events.id)");
  out.push("        AND NOT EXISTS (SELECT 1 FROM derivations");
  out.push("                         WHERE kind = 'event' AND (ancestor_id = events.id OR descendant_id = events.id));");
  out.push("");
  out.push("DELETE FROM notes");
  out.push("      WHERE id IN (SELECT note_id FROM _seed_old_entries)");
  out.push("        AND NOT EXISTS (SELECT 1 FROM timeline_entries WHERE note_id = notes.id)");
  out.push("        AND NOT EXISTS (SELECT 1 FROM derivations");
  out.push("                         WHERE kind = 'note' AND (ancestor_id = notes.id OR descendant_id = notes.id));");
  out.push("");

  out.push("/* ── 本番の表へ移す ── */");
  out.push("--");
  out.push("-- 通し番号にいまの最大 id を足したものを、そのまま id として使う。");
  out.push("-- 足す数を先に決めて表に固定しておくので、挿入の途中で動かない。");
  out.push("");
  out.push("CREATE TABLE _seed_base AS SELECT");
  out.push("  (SELECT IFNULL(MAX(id), 0) FROM notes)            AS note_base,");
  out.push("  (SELECT IFNULL(MAX(id), 0) FROM timeline_entries) AS entry_base,");
  out.push("  (SELECT IFNULL(MAX(id), 0) FROM events)           AS event_base;");
  out.push("");
  out.push("INSERT INTO notes (id, author_id, tagline, body)");
  out.push("SELECT b.note_base + se.key, u.id, se.tagline, se.body");
  out.push("  FROM _seed_entries se, _seed_base b");
  out.push(`  JOIN users u ON u.username = ${owner};`);
  out.push("");
  out.push("INSERT INTO events (id, year, precision, title, category, subcategory, links, created_by)");
  out.push("SELECT b.event_base + sv.key, sv.year, 'year', sv.title, sv.category, sv.subcategory, sv.links, u.id");
  out.push("  FROM _seed_events sv, _seed_base b");
  out.push(`  JOIN users u ON u.username = ${owner};`);
  out.push("");
  out.push("INSERT INTO timeline_entries (id, timeline_id, note_id)");
  out.push("SELECT b.entry_base + se.key, t.id, b.note_base + se.key");
  out.push("  FROM _seed_entries se, _seed_base b");
  out.push(`  JOIN users u ON u.username = ${owner}`);
  out.push("  JOIN timelines t ON t.owner_id = u.id AND t.slug = se.slug;");
  out.push("");
  out.push("INSERT INTO timeline_entry_events (entry_id, event_id, position)");
  out.push("SELECT b.entry_base + sv.entry_key, b.event_base + sv.key, sv.position");
  out.push("  FROM _seed_events sv, _seed_base b;");
  out.push("");
  out.push("UPDATE timelines SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  out.push(` WHERE slug IN (${slugs}) AND owner_id = (SELECT id FROM users WHERE username = ${owner});`);
  out.push("");
  out.push("/* ── 後片付け ── */");
  out.push("");
  out.push("DROP TABLE _seed_entries;");
  out.push("DROP TABLE _seed_events;");
  out.push("DROP TABLE _seed_old_entries;");
  out.push("DROP TABLE _seed_old_events;");
  out.push("DROP TABLE _seed_base;");
  out.push("");

  return out.join("\n");
}

/* ── 実行 ─────────────────────────────────────────────────────────────── */

function report(byCategory) {
  const lines = [];

  for (const [category, entries] of Object.entries(byCategory)) {
    const years = entries.map((e) => e.year);
    const events = entries.reduce((n, e) => n + e.events.length, 0);
    const compound = entries.filter((e) => e.events.length > 1).length;
    const tagged = entries.filter((e) => e.tagline).length;
    const links = entries.reduce(
      (n, e) => n + e.events.reduce((m, ev) => m + ev.links.length, 0),
      0,
    );

    lines.push(
      `${TIMELINES[category].slug.padEnd(6)} entry ${String(entries.length).padStart(4)}  ` +
        `event ${String(events).padStart(4)}（束ね ${compound}）  ` +
        `コピー ${String(tagged).padStart(3)}  ` +
        `${Math.min(...years)}〜${Math.max(...years)}  リンク ${links} 本`,
    );
  }

  const entries = Object.values(byCategory).flat();
  const events = entries.reduce((n, e) => n + e.events.length, 0);
  lines.push(
    `合計   entry ${String(entries.length).padStart(4)}  event ${String(events).padStart(4)}  ` +
      `コピー ${entries.filter((e) => e.tagline).length}`,
  );
  return lines.join("\n");
}

const source = await loadSourceEvents();
const curation = await loadCuration();

// 知らない category が来たら黙って落とさず気づけるようにする。
const unknown = [...new Set(source.map((s) => s.cat).filter((c) => !c || !TIMELINES[c]))];
if (unknown.length) {
  throw new Error(`投入先の決まっていない category がある: ${unknown.join(", ")}`);
}

// 素通ししてはいけないものだけ弾く。
const broken = source.filter((s) => !Number.isInteger(s.y) || !s.t);
if (broken.length) throw new Error(`year か title が欠けている行が ${broken.length} 件ある`);

// 仕分け表が元データを取りこぼしていないか。data:check と同じことを見ている。
const listed = new Set(source.map((s) => s.t));
for (const title of curation.slash.keys()) {
  if (!listed.has(title)) throw new Error(`slash.json に元データに無いタイトルがある: ${title}`);
}
const inlineMissing = curation.inlineParens.items.filter((i) => i.disposition !== "keep");
if (inlineMissing.length) {
  throw new Error(`inline-parens.json に keep 以外がある。変換側の対応が要る`);
}

const entries = source.flatMap((src) => toEntries(src, curation));

const byCategory = {};
for (const category of Object.keys(TIMELINES)) byCategory[category] = [];
for (const entry of entries) byCategory[entry.category].push(entry);

await mkdir(DATA_DIR, { recursive: true });
await writeFile(
  path.join(DATA_DIR, "sf-tech-lifeline.json"),
  JSON.stringify(
    { source: { repo: SOURCE_REPO, commit: SOURCE_COMMIT }, byCategory },
    null,
    2,
  ),
  "utf8",
);
await writeFile(path.join(DATA_DIR, "sf-tech-lifeline.sql"), buildSql(entries), "utf8");

process.stdout.write(report(byCategory) + "\n");
process.stdout.write("\n→ data/sf-tech-lifeline.json\n→ data/sf-tech-lifeline.sql\n");
