/**
 * 同意画面が要るもの（docs/007-mcp.md）。
 *
 * OAuthProvider の helper は `platform.env.OAUTH_PROVIDER` に入っている。
 * 型は Worker のバインディングの側にあるので、ここでは**必要な形だけ**を
 * 宣言して受ける。lib は `@sveltejs/kit` も Worker の入口も知らない。
 */

import { invalid, unauthenticated } from "../errors";
import { SCOPES, type Scope } from "./tools";
import type { SessionUser } from "../auth";

/** OAuthProvider の helper のうち、同意画面が使う分だけ。 */
export type OAuthHelpers = {
  parseAuthRequest(request: Request): Promise<AuthRequest>;
  lookupClient(clientId: string): Promise<ClientInfo | null>;
  completeAuthorization(options: {
    request: AuthRequest;
    userId: string;
    metadata: Record<string, unknown>;
    scope: string[];
    props: Record<string, unknown>;
  }): Promise<{ redirectTo: string }>;
};

export type AuthRequest = { clientId: string; scope: string[] };
export type ClientInfo = { clientId: string; clientName?: string; clientUri?: string };

/**
 * トークンに焼き付ける値。`/mcp` はこれだけを見て「誰が・何をしてよいか」を決める。
 *
 * **スコープも自分で入れる。** OAuthProvider はトークンの検証と props の
 * 復号まではやるが、許した範囲をハンドラに渡してはくれない（README:
 * "does not expose a standard effective-token authorization context to API
 * handlers or enforce operation-level scope policy"）。渡し忘れると
 * 「全部できる」でも「何もできない」でもなく、**黙って何も見えなくなる**ので、
 * 型で必須にしておく。
 */
export type TokenProps = { user: SessionUser; scopes: Scope[] };

/** 画面に出す 1 つの許可。何ができるようになるかを日本語で言う。 */
export type ScopeChoice = { scope: Scope; label: string; detail: string };

const LABELS: Record<Scope, { label: string; detail: string }> = {
  "timeline:read": {
    label: "年表を読む",
    detail: "出来事を探し、年表の中身を読みます。年表はもともと誰でも読めます",
  },
  "note:write": {
    label: "見方を書く",
    detail: "既にある出来事に、キャッチコピーと説明を付けます。事実には触りません",
  },
  "event:write": {
    label: "出来事を足す",
    detail: "年表に出来事を足し、他人の年表から自分の年表に載せます",
  },
};

/** 求められているもののうち、こちらが出せるものだけを画面に出す。 */
export function choicesFor(requested: readonly string[]): ScopeChoice[] {
  const asked = requested.length ? requested : SCOPES;
  return SCOPES.filter((scope) => asked.includes(scope)).map((scope) => ({
    scope,
    ...LABELS[scope],
  }));
}

/**
 * 画面から戻ってきた選択を確かめる。
 *
 * **求められていないスコープは渡さない。** フォームの値は信用しないので、
 * 求められた範囲との積を取る。1 つも選ばれなければ、それは拒否と同じ。
 */
export function grantedFrom(requested: readonly string[], chosen: readonly string[]): Scope[] {
  const allowed = choicesFor(requested).map((choice) => choice.scope);
  const granted = allowed.filter((scope) => chosen.includes(scope));
  if (!granted.length) throw invalid("許可するものを 1 つ以上選んでください", "no_scope_chosen");
  return granted;
}

/**
 * 同意できる人かを確かめる。
 *
 * **`forbidden` ではなく `unauthenticated`。** AI クライアントから「繋ぐ」を
 * 押した人がまだログインしていないのは普通のことで、そこで 403 の壁を出すと
 * 何をすればよいか分からない。`page()` がログインへ送り、戻ってくれば
 * クエリごと同意画面が続く（docs/004-layers.md 4 章）。
 *
 * allowlist はログインの側で効いている（docs/002-github-oauth.md）ので、
 * クローズド運用の前提は MCP でも変わらない。
 */
export function requireConsentingUser(user: SessionUser | null): SessionUser {
  if (!user) throw unauthenticated();
  return user;
}
