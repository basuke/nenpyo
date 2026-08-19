import { error } from "@sveltejs/kit";

/** SvelteKit の RequestEvent が渡してくる platform の型。 */
export type MaybePlatform = Readonly<App.Platform> | undefined;

/**
 * D1 バインディングを取り出す。
 * `vite dev` では adapter-cloudflare がローカルの D1 をエミュレートするので、
 * 開発時も本番と同じ経路で取れる。
 */
export function requireDb(platform: MaybePlatform): D1Database {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "D1 バインディング DB が見つかりません");
  }
  return db;
}

/** OAuth の資格情報。未設定なら分かる形で落とす。 */
export function requireGithubOAuth(platform: MaybePlatform) {
  const clientId = platform?.env?.GITHUB_CLIENT_ID;
  const clientSecret = platform?.env?.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw error(
      500,
      "GitHub OAuth が未設定です。GITHUB_CLIENT_ID と GITHUB_CLIENT_SECRET を設定してください",
    );
  }
  return { clientId, clientSecret };
}
