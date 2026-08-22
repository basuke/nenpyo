/**
 * Worker の入口（docs/007-mcp.md）。
 *
 * `OAuthProvider` が default export を持ち、`/mcp` と OAuth のエンドポイントを
 * 引き受けて、残りを SvelteKit へ渡す。SvelteKit 側から見ると
 * `platform.env.OAUTH_PROVIDER` に helper が増えているだけで、
 * 画面も既存の API も何も変わらない。
 *
 * **`src/` の外に置いてある。** これは SvelteKit のコードではなく Worker の
 * 入口で、`.svelte-kit` のビルド成果物を import する。`src/` に置くと
 * tsconfig の `checkJs` が生成物まで追いかけて、svelte-check が
 * 1000 件のエラーを出す。
 *
 * **adapter-cloudflare は `main` の指す先に自分の生成物を書く。** そのままだと
 * このファイルが上書きされるので、アダプタには `wrangler.svelte.jsonc` を
 * 読ませて書き出し先を分けてある（svelte.config.js）。
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { env } from "cloudflare:workers";
import { handleMcpRequest } from "../src/lib/server/mcp/http";
import { SCOPES } from "../src/lib/server/mcp/tools";
import type { TokenProps } from "../src/lib/server/mcp/consent";
// @ts-expect-error — SvelteKit のビルド成果物に型は無い。pnpm build が先に要る。
import sveltekit from "../.svelte-kit/cloudflare/_worker.js";

type WorkerEnv = { DB: D1Database };

/**
 * このサービスが外から見えているオリジン。
 *
 * トークンをどの資源に結びつけるかがここで決まる。**仕様は audience の検証を
 * MUST と言っている**ので、決め打ちにはできても省略はしたくない。決め打ちに
 * すると開発で繋がらなくなるので、設定から読む（wrangler.jsonc の vars、
 * 開発時は .dev.vars で上書き）。
 */
const ORIGIN = (env as { PUBLIC_ORIGIN?: string }).PUBLIC_ORIGIN ?? "https://nenpyo.net";
const RESOURCE = `${ORIGIN}/mcp`;

/**
 * MCP エンドポイント。
 *
 * ここに来る時点でトークンは検証済みで、`ctx.props` には同意したときに
 * 焼き付けた値が入っている。**Cookie は見ない。** 別のオリジンから来るので
 * 効かないし、効かせるべきでもない（docs/006-api.md 2 章）。
 */
const mcp: ExportedHandler<WorkerEnv> = {
  async fetch(request, env, ctx) {
    const props = (ctx as unknown as { props?: TokenProps }).props;

    if (!props?.user) {
      return new Response(JSON.stringify({ error: "トークンにユーザーが入っていません" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return handleMcpRequest(request, { db: env.DB, user: props.user }, props.scopes ?? []);
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcp as ExportedHandler,
  defaultHandler: sveltekit as ExportedHandler,

  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",

  scopesSupported: [...SCOPES],

  resourceMetadata: {
    resource: RESOURCE,
    authorization_servers: [ORIGIN],
    scopes_supported: [...SCOPES],
    resource_name: "年表.net",
  },

  // `client_id` が HTTPS の URL で、AS がそれを読んで素性を確かめる。
  // MCP 2026 で DCR は非推奨になり、こちらが推奨になった。
  clientIdMetadataDocumentEnabled: true,

  // **互換のために残す。** 仕様は DCR を非推奨にしたが、いま出回っている
  // クライアントの多くはまだこちらで登録してくる。塞ぐと繋がらない。
  clientRegistrationEndpoint: "/oauth/register",
});
