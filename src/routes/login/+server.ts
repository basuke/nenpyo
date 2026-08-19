import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { beginOAuth } from "$lib/server/auth";
import { requireGithubOAuth } from "$lib/server/platform";

export const GET: RequestHandler = ({ url, cookies, platform, locals }) => {
  // ログイン後に戻る先。オープンリダイレクトにしないよう、同一サイト内のパスだけ許す。
  const requested = url.searchParams.get("redirect") ?? "/";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (locals.user) throw redirect(303, returnTo);

  const { clientId } = requireGithubOAuth(platform);
  const redirectUri = `${url.origin}/auth/github/callback`;

  throw redirect(303, beginOAuth(cookies, clientId, redirectUri, returnTo));
};
