/**
 * スパイク（#34）— /authorize を SvelteKit のルートとして書けるか。
 *
 * OAuthProvider は authorizeEndpoint を「自分では処理せず defaultHandler へ
 * 渡す」。つまり同意画面は普通のページとして書けるはずで、ログインも既存の
 * requireUser がそのまま効くはず。それを確かめる。
 */

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ platform, locals }) => {
  const helpers = (platform?.env as Record<string, unknown> | undefined)?.OAUTH_PROVIDER;

  return Response.json({
    reachedSvelteKit: true,
    // OAuthProvider が env に注入する helper。これが見えれば
    // parseAuthRequest / completeAuthorization を SvelteKit から呼べる。
    oauthProviderVisible: Boolean(helpers),
    oauthHelpers: helpers ? Object.getOwnPropertyNames(Object.getPrototypeOf(helpers)) : null,
    // 既存のセッションがそのまま効くか
    user: locals.user?.username ?? null,
  });
};
