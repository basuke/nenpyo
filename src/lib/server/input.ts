/**
 * 入力の検証。**plain object を受けて、検証済みの値を返す**。
 *
 * `FormData` を直に受けないのが肝。フォームから来ようが JSON から来ようが
 * 同じ検証を通したいので、ここは「どの入り口から来たか」を知らないままにする。
 * `FormData` → plain object の変換は境目の仕事（`route.ts`）。
 *
 * 失敗は `AppError("invalid")` を投げる。呼ぶ側は成否を分岐せず、書けたときの
 * 道だけを書けばよい。フォームに戻すか JSON にするかは入り口が決める。
 */

import { invalid } from "./errors";
import { normalizeSlug, slugError } from "$lib/slug";
import type { MergeNote, PlacedNote } from "./db";

/**
 * 検証前の入力。値が `unknown` なのは、フォームなら文字列、JSON なら数値や
 * 真偽値が来るため。**どちらが来ても同じ結果になる**ようにここで吸収する。
 */
export type RawInput = Record<string, unknown>;

function text(raw: RawInput, name: string): string {
  const value = raw[name];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** 空文字は NULL として持つ。「未入力」と「空文字」を DB 上で分けない。 */
function optionalText(raw: RawInput, name: string): string | null {
  return text(raw, name) || null;
}

/* ── timeline ─────────────────────────────────────────────────────────── */

export type TimelineInput = { slug: string; title: string; description: string | null };

export function parseTimelineInput(raw: RawInput): TimelineInput {
  const title = text(raw, "title");
  if (!title) throw invalid("タイトルを入力してください", "title_required");
  if (title.length > 200) throw invalid("タイトルは 200 文字までです", "title_too_long");

  const message = slugError(text(raw, "slug"));
  if (message) throw invalid(message, "slug_invalid");

  return {
    slug: normalizeSlug(text(raw, "slug")),
    title,
    description: optionalText(raw, "description"),
  };
}

/* ── entry ────────────────────────────────────────────────────────────── */

/**
 * 年表の 1 行ぶんの入力。事実（year / title / category / links）と
 * ノート（tagline / body）が 1 枚のフォームに同居している。
 *
 * DB では events と notes に分かれて入るが、自分の年表に自分で書くあいだは
 * 分けて入力させる意味がないので、入力は 1 組のままにしている。
 */
export type EntryInput = {
  year: number;
  title: string;
  tagline: string | null;
  body: string | null;
  category: string | null;
  subcategory: string | null;
  links: string | null;
};

export function parseEntryInput(raw: RawInput): EntryInput {
  const rawYear = text(raw, "year");
  if (!rawYear) throw invalid("年を入力してください", "year_required");

  const year = Number(rawYear);
  if (!Number.isInteger(year)) throw invalid("年は整数で入力してください", "year_invalid");
  if (year < -9999 || year > 9999) throw invalid("年は -9999 〜 9999 の範囲です", "year_out_of_range");

  const title = text(raw, "title");
  if (!title) throw invalid("タイトルを入力してください", "title_required");
  if (title.length > 300) throw invalid("タイトルは 300 文字までです", "title_too_long");

  const tagline = optionalText(raw, "tagline");
  if (tagline && tagline.length > 100) {
    throw invalid("キャッチコピーは 100 文字までです", "tagline_too_long");
  }

  return {
    year,
    title,
    tagline,
    body: optionalText(raw, "body"),
    category: optionalText(raw, "category"),
    subcategory: optionalText(raw, "subcategory"),
    links: parseLinksInput(text(raw, "links")),
  };
}

/* ── ノートの選び方 ───────────────────────────────────────────────────── */

/**
 * 束ねるときに、どちらのノートを採るか。
 *
 * `note_id` は 1 本しか刺さらないので、必ず選ばせる。選ばれなかったほうが
 * どうなるかは `sql.mergeEntries` の側（docs/003 の 6 章）。
 */
export function parseMergeChoice(
  raw: RawInput,
  notes: { target: number | null; source: number | null },
): MergeNote {
  switch (text(raw, "choice")) {
    case "target":
      return { kind: "existing", noteId: notes.target };
    case "source":
      return { kind: "existing", noteId: notes.source };
    case "new": {
      const tagline = optionalText(raw, "tagline");
      const body = optionalText(raw, "body");
      if (!tagline && !body) throw invalid("新しいノートの中身が空です", "note_empty");
      return { kind: "new", tagline, body };
    }
    default:
      throw invalid("どのノートを採るか選んでください", "note_choice_required");
  }
}

/**
 * 他人の年表から載せるときに、ノートをどうするか。
 *
 * 既定は `none`。何も選ばなければノートは付かない。事実だけを持ってくるのが
 * いちばん軽い載せ方なので、それを既定にしている。
 */
export function parsePlacedNote(raw: RawInput): PlacedNote {
  switch (text(raw, "note")) {
    case "share":
      return { kind: "share" };
    case "own":
      return {
        kind: "own",
        tagline: optionalText(raw, "tagline"),
        body: optionalText(raw, "body"),
      };
    default:
      return { kind: "none" };
  }
}

/* ── links ────────────────────────────────────────────────────────────── */

/**
 * リンクは 1 行 1 本のテキストエリアで受け、記法を保ったまま JSON 配列にする。
 * 展開は表示時にだけ行う（$lib/links）。
 */
export function parseLinksInput(input: string): string | null {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? JSON.stringify(lines) : null;
}

/** 逆向き。編集フォームに戻すとき用。 */
export function formatLinksInput(json: string | null): string {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").join("\n") : "";
  } catch {
    return "";
  }
}
