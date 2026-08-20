import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  SignInNotAllowed,
  completeOAuth,
  createSession,
  setSessionCookie,
} from "$lib/server/auth";
import { requireDb, requireGithubOAuth } from "$lib/server/platform";

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(OAUTH_STATE_COOKIE);
  const returnTo = cookies.get(OAUTH_REDIRECT_COOKIE) ?? "/";

  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });
  cookies.delete(OAUTH_REDIRECT_COOKIE, { path: "/" });

  if (!code || !state) throw error(400, "OAuth のパラメータが足りません");
  if (!expectedState || state !== expectedState) throw error(400, "OAuth の state が一致しません");

  const db = requireDb(platform);
  const { clientId, clientSecret } = requireGithubOAuth(platform);
  const redirectUri = `${url.origin}/auth/github/callback`;

  let user;
  try {
    user = await completeOAuth(db, code, clientId, clientSecret, redirectUri);
  } catch (cause) {
    // allowlist から外れている人は、拒否ではなく「準備中」を返す。
    // クローズド運用は招待制であって、締め出しではないため。
    if (cause instanceof SignInNotAllowed) throw redirect(303, "/pending");
    throw cause;
  }

  const session = await createSession(db, user.id);
  setSessionCookie(cookies, session.token, session.expiresAt);

  throw redirect(303, returnTo === "/" ? `/@${user.username}` : returnTo);
};
