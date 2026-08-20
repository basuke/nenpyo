// 仕分け表（curation/*.json）が元データと矛盾していないか確かめる。
//
// 仕分けは人力で行うので、元データのタイトルを転記し損ねる・拾い漏らす・
// 二重に書く、といった取りこぼしが必ず起きる。それを機械で潰すためのもの。
// 元データを更新したときの追従漏れもここで落ちる。
//
//   pnpm data:check
//
// 仕分け表そのものの正しさ（この分類が妥当か）は見ない。整合だけを見る。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "data", "sf-tech-lifeline.json");

const problems = [];
const fail = (message) => problems.push(message);

const source = JSON.parse(await readFile(SOURCE, "utf8"));
const events = Object.values(source.byCategory).flat();

/* ── slash.json（Issue #5） ──────────────────────────────────────────── */

// 元データ側で対象になるのは「タイトルに / を含むもの」全部。
// 仕分け表はこれと過不足なく一致していなければならない。
const slashEvents = events.filter((event) => /[/／]/.test(event.title));
const slash = JSON.parse(await readFile(path.join(ROOT, "curation", "slash.json"), "utf8"));

const listed = new Map();
for (const item of slash.items) {
  if (listed.has(item.title)) fail(`slash.json: 二重に載っている — ${item.title}`);
  listed.set(item.title, item);
}

for (const event of slashEvents) {
  const item = listed.get(event.title);
  if (!item) {
    fail(`slash.json: 元データにあるのに載っていない — ${event.title}`);
    continue;
  }
  // year / category を転記しているので、写し間違いを潰す。
  if (item.year !== event.year) fail(`slash.json: year が違う — ${event.title} (${item.year} ≠ ${event.year})`);
  if (item.category !== event.category) fail(`slash.json: category が違う — ${event.title}`);
}

for (const title of listed.keys()) {
  if (!slashEvents.some((event) => event.title === title)) {
    fail(`slash.json: 元データに無いタイトル — ${title}`);
  }
}

const DISPOSITIONS = new Set(["keep", "compound", "split", "tagline"]);
for (const item of slash.items) {
  if (!DISPOSITIONS.has(item.disposition)) {
    fail(`slash.json: 未知の disposition「${item.disposition}」— ${item.title}`);
  }
  if (!item.reason) fail(`slash.json: reason がない — ${item.title}`);

  // keep は分割しないので events を持たない。compound / split は 2 つ以上に割れる。
  if (item.disposition === "keep") {
    if (item.events) fail(`slash.json: keep なのに events がある — ${item.title}`);
    continue;
  }

  // tagline は「'/' の片側が出来事ではなく読み」なので event は 1 つに減る。
  // 未決のものだけ 0 件を許す（指せる event が存在しないため。unresolved で明示させる）。
  if (item.disposition === "tagline") {
    if (item.events.length === 0 && !item.unresolved) {
      fail(`slash.json: tagline なのに events が空で unresolved も無い — ${item.title}`);
    }
    if (item.events.length > 1) fail(`slash.json: tagline なのに events が複数 — ${item.title}`);
    if (item.events.length === 1 && !item.events[0].tagline) {
      fail(`slash.json: tagline を書き出していない — ${item.title}`);
    }
    continue;
  }

  if (!item.events || item.events.length < 2) {
    fail(`slash.json: ${item.disposition} なのに events が 2 件未満 — ${item.title}`);
    continue;
  }
  for (const child of item.events) {
    if (!child.title) fail(`slash.json: 分割後のタイトルが空 — ${item.title}`);
  }
  // split は entry が分かれるので、読みもそれぞれに要る。
  // 書き下ろしが要るものは todo を立てて明示させる。
  if (item.disposition === "split") {
    for (const child of item.events) {
      if (!child.body && !child.todo) {
        fail(`slash.json: split の body も todo も無い — ${item.title} / ${child.title}`);
      }
    }
  }
}

/* ── まとめ ──────────────────────────────────────────────────────────── */

const counts = { keep: 0, compound: 0, split: 0, tagline: 0 };
for (const item of slash.items) counts[item.disposition] = (counts[item.disposition] ?? 0) + 1;

const eventsAfter = slash.items.reduce((sum, item) => sum + (item.events?.length ?? 1), 0);
const entriesAfter = slash.items.reduce(
  (sum, item) => sum + (item.disposition === "split" ? item.events.length : 1),
  0,
);
const trends = slash.items.flatMap((item) => (item.events ?? []).filter((child) => child.trend));
const unresolved = slash.items.filter((item) => item.unresolved);

console.log(`slash.json: ${slash.items.length} 件（元データ ${slashEvents.length} 件）`);
console.log(
  `  keep ${counts.keep} / compound ${counts.compound} / split ${counts.split} / tagline ${counts.tagline}`,
);
console.log(`  → event ${eventsAfter} 件、entry ${entriesAfter} 件`);
console.log(`  trend フラグ付き: ${trends.length} 件`);
if (unresolved.length) {
  console.log(`  未決: ${unresolved.length} 件`);
  for (const item of unresolved) console.log(`    - ${item.title}\n      ${item.unresolved}`);
}

if (problems.length) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nOK");
