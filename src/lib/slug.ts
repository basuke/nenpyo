/**
 * タイムラインの slug。
 *
 * 先頭が英数字なので、URL のアプリ機能側に使う `/-/` と原理的に衝突しない
 * （docs/001-mvp.md 5 章）。日本語タイトルからの自動生成は現実的に機能しない
 * ため、作成フォームでは必須入力にしている。
 */

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;
export const SLUG_MAX_LENGTH = 50;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** 入力を受け付けられる形に寄せる。整形しても通らないものは通さない。 */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

/** 弾いた理由を日本語で返す。通るなら null。 */
export function slugError(input: string): string | null {
  const slug = normalizeSlug(input);
  if (!slug) return "slug を入力してください";
  if (slug.length > SLUG_MAX_LENGTH) return `slug は ${SLUG_MAX_LENGTH} 文字までです`;
  if (!/^[a-z0-9]/.test(slug)) return "slug は英数字で始めてください";
  if (!SLUG_PATTERN.test(slug)) return "slug に使えるのは英小文字・数字・ハイフンだけです";
  return null;
}
