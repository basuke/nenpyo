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

/* ── inline-parens.json（Issue #7） ──────────────────────────────────── */

// #7 が見るのは slash.json の分割を織り込んだあとのタイトル。分割で新しく
// 生まれた「Bフレッツ(光回線)開始」なども対象に入るので、ここで組み立て直す。
const splitBySlash = new Map(
  slash.items.filter((item) => item.disposition !== "keep").map((item) => [item.title, item]),
);

const curatedTitles = events.flatMap((event) => {
  const item = splitBySlash.get(event.title);
  const titles = item ? item.events.map((child) => child.title) : [event.title];
  return titles.map((title) => ({ title, year: event.year, category: event.category }));
});

// 末尾ではない位置にある括弧だけを拾う。末尾のものは #6 の対象。
function inlineParens(title) {
  const trimmed = title.trimEnd();
  return [...trimmed.matchAll(/\(([^()]*)\)/g)]
    .filter((match) => match.index + match[0].length < trimmed.length)
    .map((match) => match[1]);
}

const withInline = curatedTitles.filter((row) => inlineParens(row.title).length > 0);
const inline = JSON.parse(await readFile(path.join(ROOT, "curation", "inline-parens.json"), "utf8"));

const inlineListed = new Map();
for (const item of inline.items) {
  if (inlineListed.has(item.title)) fail(`inline-parens.json: 二重に載っている — ${item.title}`);
  inlineListed.set(item.title, item);
}

for (const row of withInline) {
  const item = inlineListed.get(row.title);
  if (!item) {
    fail(`inline-parens.json: 対象なのに載っていない — ${row.title}`);
    continue;
  }
  if (item.year !== row.year) fail(`inline-parens.json: year が違う — ${row.title}`);
}

for (const item of inline.items) {
  if (!withInline.some((row) => row.title === item.title)) {
    fail(`inline-parens.json: 対象ではないタイトル — ${item.title}`);
  }
  if (!["keep", "tagline"].includes(item.disposition)) {
    fail(`inline-parens.json: 未知の disposition「${item.disposition}」— ${item.title}`);
  }
  if (!item.reason || item.reason === "TODO") fail(`inline-parens.json: reason が無い — ${item.title}`);
  // 転記した括弧の中身が、実際にそのタイトルに含まれているか。
  if (!item.title.includes(`(${item.inline})`)) {
    fail(`inline-parens.json: inline「${item.inline}」がタイトルにない — ${item.title}`);
  }
}

/* ── taglines.json（Issue #6） ───────────────────────────────────────── */

// #6 が見るのは末尾に括弧を持つタイトル。#7 と同じ curatedTitles の上に乗る。
const withTrailing = curatedTitles.filter((row) => /\([^()]*\)\s*$/.test(row.title));
const taglines = JSON.parse(await readFile(path.join(ROOT, "curation", "taglines.json"), "utf8"));

const taglineListed = new Map();
for (const item of taglines.items) {
  if (taglineListed.has(item.title)) fail(`taglines.json: 二重に載っている — ${item.title}`);
  taglineListed.set(item.title, item);
}

for (const row of withTrailing) {
  const item = taglineListed.get(row.title);
  if (!item) {
    fail(`taglines.json: 対象なのに載っていない — ${row.title}`);
    continue;
  }
  if (item.year !== row.year) fail(`taglines.json: year が違う — ${row.title}`);
}

for (const item of taglines.items) {
  if (!withTrailing.some((row) => row.title === item.title)) {
    fail(`taglines.json: 対象ではないタイトル — ${item.title}`);
  }
  if (!item.newTitle?.trim()) fail(`taglines.json: newTitle が空 — ${item.title}`);
  if (item.tagline !== null && !item.tagline?.trim()) {
    fail(`taglines.json: tagline が空文字 — ${item.title}`);
  }

  // 括弧の中を「。」で割った内訳が、元の中身を過不足なく覆っているか。
  // 読みを切り出すときに事実まで落としてしまう取りこぼしを、ここで捕まえる。
  const inner = item.title.match(/\(([^()]*)\)\s*$/)[1];
  const rejoined = item.segments.map((segment) => segment.text).join("。");
  if (rejoined !== inner.trim()) {
    fail(`taglines.json: segments が元の括弧と一致しない — ${item.title}\n      ${rejoined} ≠ ${inner}`);
  }

  // 事実と判定した分が newTitle に、読みと判定した分が tagline に入っているか。
  const facts = item.segments.filter((s) => s.kind === "fact").map((s) => s.text);
  const kept = item.newTitle.match(/\(([^()]*)\)\s*$/);
  const keptInner = kept ? kept[1] : "";
  if (facts.join("。") !== keptInner) {
    fail(`taglines.json: fact と newTitle の括弧が食い違う — ${item.title}`);
  }
  const reading = item.segments.filter((s) => s.kind === "tagline").map((s) => s.text).join("。");
  if ((reading || null) !== item.tagline) {
    fail(`taglines.json: tagline と segments が食い違う — ${item.title}`);
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

const inlineCounts = { keep: 0, tagline: 0 };
for (const item of inline.items) inlineCounts[item.disposition] += 1;
console.log(`\ninline-parens.json: ${inline.items.length} 件（対象 ${withInline.length} 件）`);
console.log(`  keep ${inlineCounts.keep} / tagline ${inlineCounts.tagline}`);

const withTagline = taglines.items.filter((item) => item.tagline);
const lowConfidence = taglines.items.filter((item) => item.confidence === "low");
console.log(`\ntaglines.json: ${taglines.items.length} 件（対象 ${withTrailing.length} 件）`);
console.log(`  読みを切り出した ${withTagline.length} / 事実補足のみ ${taglines.items.length - withTagline.length}`);
console.log(`  confidence: low ${lowConfidence.length}`);

if (problems.length) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nOK");
