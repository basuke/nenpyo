/**
 * 元データ（matsuo-koya/sf-tech-lifeline）のリンク記法を展開する。
 *
 *   "階差機関"                    → 日本語版 Wikipedia の記事
 *   "en:Analytical Engine"        → 英語版 Wikipedia の記事
 *   "記事名|表示名"                → 表示名を差し替える
 *   "https://example.com/|表示名"  → 外部リンク
 *
 * 記法は元データのまま DB に保持し（links カラムの JSON 配列）、
 * 展開はここでだけ行う。元データとの往復が効くようにするため。
 */

export type ParsedLink = {
  href: string;
  label: string;
  /** Wikipedia 記事なら言語コード。外部リンクなら null。 */
  wikipedia: string | null;
};

const DEFAULT_WIKIPEDIA_LANG = "ja";

/** "ja" / "en" のような言語プレフィックスを剥がす。 */
function splitLangPrefix(article: string): { lang: string; title: string } {
  const match = /^([a-z]{2,3}):(.+)$/.exec(article);
  if (!match) return { lang: DEFAULT_WIKIPEDIA_LANG, title: article };
  return { lang: match[1], title: match[2] };
}

function wikipediaUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function isExternal(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function parseLink(raw: string): ParsedLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "target|表示名"。外部 URL にもクエリの & は入るが | は入らないので、最初の | で切る。
  const pipe = trimmed.indexOf("|");
  const target = pipe === -1 ? trimmed : trimmed.slice(0, pipe).trim();
  const explicitLabel = pipe === -1 ? null : trimmed.slice(pipe + 1).trim();
  if (!target) return null;

  if (isExternal(target)) {
    let fallback = target;
    try {
      fallback = new URL(target).hostname;
    } catch {
      // URL として壊れていても、リンクを落とさず生の文字列を見せる。
    }
    return { href: target, label: explicitLabel || fallback, wikipedia: null };
  }

  const { lang, title } = splitLangPrefix(target);
  return {
    href: wikipediaUrl(lang, title),
    label: explicitLabel || title,
    wikipedia: lang,
  };
}

/** DB の links カラム（JSON 文字列）を展開する。壊れていても落とさない。 */
export function parseLinks(json: string | null | undefined): ParsedLink[] {
  if (!json) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map(parseLink)
    .filter((link): link is ParsedLink => link !== null);
}
