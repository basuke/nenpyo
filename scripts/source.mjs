// 元データ（松尾公也さんの sf-tech-lifeline）の読み込み。
//
// convert / check / propose の 3 本が同じものを見る。それぞれが自前で読んで
// いたせいで、convert の出力形を変えたときに残り 2 本が壊れた。出どころを
// 1 か所にしておけば、次に形が変わっても割れない。
//
//   出典: https://github.com/matsuo-koya/sf-tech-lifeline (MIT)
//   利用: 共同制作として許諾取得済み（docs/001-mvp.md 8.1）

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");

// 再現性のためコミットで固定する。更新したいときはここを差し替える。
export const SOURCE_REPO = "matsuo-koya/sf-tech-lifeline";
export const SOURCE_COMMIT = "ad94155d0cc5163e539e7cdda14d49e584515a8c";
const SOURCE_URL = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/src/events.js`;

const cachePath = () => path.join(DATA_DIR, `events.${SOURCE_COMMIT.slice(0, 7)}.js`);

/**
 * events.js を取得する。一度落としたら data/ にキャッシュする。
 * fetch:false なら、キャッシュが無いときに取りに行かず null を返す。
 */
export async function loadSourceEvents({ fetchIfMissing = true } = {}) {
  const cached = cachePath();

  if (!existsSync(cached)) {
    if (!fetchIfMissing) return null;
    await mkdir(DATA_DIR, { recursive: true });
    process.stderr.write(`fetching ${SOURCE_URL}\n`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`failed to fetch source: ${res.status} ${res.statusText}`);
    await writeFile(cached, await res.text(), "utf8");
  }

  const { EVENTS } = await import(`file://${cached}`);
  if (!Array.isArray(EVENTS)) throw new Error("EVENTS is not an array");
  return EVENTS;
}

/** 仕分け表と突き合わせるとき使う、title / year / category だけの形。 */
export function toPlainRows(source) {
  return source.map((src) => ({ title: src.t, year: src.y, category: src.cat ?? null }));
}
