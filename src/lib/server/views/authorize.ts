/**
 * MCP クライアントへの同意（docs/007-mcp.md）。
 *
 * **ログインは既存のものをそのまま使う。** AI クライアントは GitHub を見ず、
 * 見るのは nenpyo.net だけ。GitHub は「うちがあなたを確かめる手段」のまま。
 * `allowed_github_ids` の allowlist も効いたままになる。
 */

import { invalid, notFound } from "../errors";
import { choicesFor, grantedFrom, requireConsentingUser } from "../mcp/consent";
import type { OAuthHelpers, ScopeChoice, TokenProps } from "../mcp/consent";
import type { AppContext } from "../context";
import type { RawInput } from "../input";

export type AuthorizeView = {
  /** 繋ごうとしているクライアント。名前を名乗らないものもある */
  client: { name: string; uri: string | null };
  /** 許可を求められているもの */
  choices: ScopeChoice[];
  user: { username: string; displayName: string | null };
};

export async function authorizeView(
  ctx: AppContext,
  request: Request,
  oauth: OAuthHelpers,
): Promise<AuthorizeView> {
  const user = requireConsentingUser(ctx.user);
  const auth = await parse(request, oauth);
  const client = await oauth.lookupClient(auth.clientId);
  if (!client) throw notFound("そのクライアントは登録されていません", "unknown_client");

  return {
    client: { name: client.clientName ?? auth.clientId, uri: client.clientUri ?? null },
    choices: choicesFor(auth.scope),
    user: { username: user.username, displayName: user.displayName },
  };
}

/**
 * 許した範囲でトークンを出す。
 *
 * `props` に入れた値がトークンに焼き付き、`/mcp` はそれだけを見て誰かを決める。
 * **セッション Cookie は MCP には効かない**（別のオリジンから来るので）。
 */
export async function approveAuthorization(
  ctx: AppContext,
  request: Request,
  oauth: OAuthHelpers,
  raw: RawInput,
): Promise<{ redirectTo: string }> {
  const user = requireConsentingUser(ctx.user);
  const auth = await parse(request, oauth);

  // チェックボックスは複数選べる。1 つだけのときは文字列で来る。
  const chosen = Array.isArray(raw.scope)
    ? raw.scope.map(String)
    : typeof raw.scope === "string"
      ? raw.scope.split(",")
      : [];

  const scopes = grantedFrom(auth.scope, chosen);

  // スコープは props にも入れる。トークン側の scope は OAuth の記録で、
  // ハンドラには渡ってこない（mcp/consent.ts の TokenProps）。
  const props: TokenProps = { user, scopes };

  return oauth.completeAuthorization({
    request: auth,
    userId: String(user.id),
    metadata: { approvedAt: new Date().toISOString() },
    scope: scopes,
    props: props as unknown as Record<string, unknown>,
  });
}

/**
 * OAuth の引数を解く。
 *
 * `parseAuthRequest` はクライアント・redirect_uri・PKCE・resource まで見てくれる。
 * 落ちたものは戻せる形ではないので、そのまま画面のエラーにする。
 */
async function parse(request: Request, oauth: OAuthHelpers) {
  try {
    return await oauth.parseAuthRequest(request);
  } catch (cause) {
    throw invalid(`OAuth の要求が読めません: ${String(cause)}`, "bad_auth_request");
  }
}
