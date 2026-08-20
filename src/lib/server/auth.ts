/**
 * GitHub OAuth とセッション。
 *
 * - セッションの実体は D1 の sessions テーブル。Cookie には id しか入れない。
 * - サインアップは allowed_github_ids による allowlist で絞る。
 * - 要求スコープは空（公開プロフィールのみ）。リポジトリ権限は要求しない。
 */

import type { Cookies } from "@sveltejs/kit";
import { isAllowedToSignIn, upsertUserFromGithub, type UserRow } from "./db";

export const SESSION_COOKIE = "nenpyo_session";
export const OAUTH_STATE_COOKIE = "nenpyo_oauth_state";
export const OAUTH_REDIRECT_COOKIE = "nenpyo_oauth_redirect";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 日
const OAUTH_STATE_TTL_SECONDS = 60 * 10;

export type SessionUser = {
  id: number;
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    githubId: user.github_id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * セッショントークンを保存用のハッシュに変える。
 *
 * Cookie に入るのは乱数そのもので、DB にはこのハッシュだけを置く。
 * こうしておくと、DB の中身が漏れても、そこから成りすませるトークンは作れない。
 *
 * ソルトも反復もしないのは、トークンが 256 ビットの乱数だから。
 * bcrypt や PBKDF2 が要るのは、総当たりが現実的な低エントロピーの秘密
 * （＝パスワード）を守るときで、ここではリクエストごとの負荷が増えるだけになる。
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/* ── セッション ───────────────────────────────────────────────────────── */

export async function createSession(
  db: D1Database,
  userId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashToken(token), userId, expiresAt.toISOString())
    .run();

  // 呼び出し側に渡すのは Cookie に入れる生のトークン。
  // この値はここでしか存在せず、DB には残らない。
  return { token, expiresAt };
}

/**
 * Cookie のトークンからユーザーを引く。
 * 期限切れの行はその場で消す（掃除専用のジョブを持たずに済ませる）。
 */
export async function resolveSession(db: D1Database, token: string): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT s.expires_at, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<UserRow & { expires_at: string }>();

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await destroySession(db, token);
    return null;
  }

  return toSessionUser(row);
}

export async function destroySession(db: D1Database, token: string) {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .run();
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
    // secure は SvelteKit の既定に委ねる（http://localhost の開発時だけ外れる）。
  });
}

export function clearSessionCookie(cookies: Cookies) {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

/* ── GitHub OAuth ─────────────────────────────────────────────────────── */

export class SignInNotAllowed extends Error {
  constructor(readonly profile: GithubProfile) {
    super(`github_id ${profile.githubId} is not on the allowlist`);
    this.name = "SignInNotAllowed";
  }
}

export type GithubProfile = {
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function beginOAuth(
  cookies: Cookies,
  clientId: string,
  redirectUri: string,
  returnTo: string,
): string {
  const state = randomToken();

  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  };
  cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  cookies.set(OAUTH_REDIRECT_COOKIE, returnTo, cookieOptions);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // scope は付けない。公開プロフィールだけで足りるので、許可のハードルを下げる。
  return url.toString();
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);

  const payload = (await res.json()) as { access_token?: string; error_description?: string };
  if (!payload.access_token) {
    throw new Error(payload.error_description ?? "GitHub token exchange returned no access token");
  }
  return payload.access_token;
}

async function fetchGithubProfile(accessToken: string): Promise<GithubProfile> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "nenpyo.net",
    },
  });

  if (!res.ok) throw new Error(`GitHub profile fetch failed: ${res.status}`);

  const payload = (await res.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    githubId: payload.id,
    username: payload.login,
    displayName: payload.name,
    avatarUrl: payload.avatar_url,
  };
}

/**
 * コールバックの本体。allowlist を通らなかった場合は SignInNotAllowed を投げる。
 * 通ったあとは github_id の一致で User 行に紐づくので、本人のログイン前に
 * 先行作成しておいた行も、そのまま本人のものになる（docs/001-mvp.md 8.4）。
 */
export async function completeOAuth(
  db: D1Database,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<UserRow> {
  const token = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);
  const profile = await fetchGithubProfile(token);

  // 先行作成した User 行があっても allowlist は素通りさせない。
  // 行の存在をログインの許可と混同すると、裏口になる。
  if (!(await isAllowedToSignIn(db, profile.githubId))) {
    throw new SignInNotAllowed(profile);
  }

  return upsertUserFromGithub(db, profile);
}
