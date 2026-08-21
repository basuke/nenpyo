/** フォーム入力の受け取り。失敗は例外にせず、理由の文字列で返す。 */

import { slugError, normalizeSlug } from "$lib/slug";

export type FormResult<T> = { ok: true; value: T } | { ok: false; message: string };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** 空文字は NULL として持つ。「未入力」と「空文字」を DB 上で分けない。 */
function optionalText(form: FormData, name: string): string | null {
  return text(form, name) || null;
}

export type TimelineForm = { slug: string; title: string; description: string | null };

export function parseTimelineForm(form: FormData): FormResult<TimelineForm> {
  const title = text(form, "title");
  if (!title) return { ok: false, message: "タイトルを入力してください" };
  if (title.length > 200) return { ok: false, message: "タイトルは 200 文字までです" };

  const slugMessage = slugError(text(form, "slug"));
  if (slugMessage) return { ok: false, message: slugMessage };

  return {
    ok: true,
    value: {
      slug: normalizeSlug(text(form, "slug")),
      title,
      description: optionalText(form, "description"),
    },
  };
}

/**
 * 年表の 1 行ぶんの入力。事実（year / title / category / links）と
 * ノート（tagline / body）が 1 枚のフォームに同居している。
 *
 * DB では events と notes に分かれて入るが、自分の年表に自分で書くあいだは
 * 分けて入力させる意味がないので、フォームは 1 枚のままにしている。
 */
export type EntryForm = {
  year: number;
  title: string;
  tagline: string | null;
  body: string | null;
  category: string | null;
  subcategory: string | null;
  links: string | null;
};

export function parseEntryForm(form: FormData): FormResult<EntryForm> {
  const rawYear = text(form, "year");
  if (!rawYear) return { ok: false, message: "年を入力してください" };

  const year = Number(rawYear);
  if (!Number.isInteger(year)) return { ok: false, message: "年は整数で入力してください" };
  if (year < -9999 || year > 9999) return { ok: false, message: "年は -9999 〜 9999 の範囲です" };

  const title = text(form, "title");
  if (!title) return { ok: false, message: "タイトルを入力してください" };
  if (title.length > 300) return { ok: false, message: "タイトルは 300 文字までです" };

  const tagline = optionalText(form, "tagline");
  if (tagline && tagline.length > 100) {
    return { ok: false, message: "キャッチコピーは 100 文字までです" };
  }

  return {
    ok: true,
    value: {
      year,
      title,
      tagline,
      body: optionalText(form, "body"),
      category: optionalText(form, "category"),
      subcategory: optionalText(form, "subcategory"),
      links: parseLinksInput(text(form, "links")),
    },
  };
}

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
