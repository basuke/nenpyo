/**
 * Worker の入口（docs/007-mcp.md）。
 *
 * `OAuthProvider` が default export を持ち、`/mcp` と OAuth のエンドポイントを
 * 引き受けて、残りを SvelteKit へ渡す。SvelteKit 側から見ると
 * `platform.env.OAUTH_PROVIDER` に helper が増えているだけで、
 * 画面も既存の API も何も変わらない。
 *
 * **`src/` の外に置いてある。** これは SvelteKit のコードではなく Worker の
 * 入口だから。ビルド成果物との繋ぎ方は `worker/sveltekit.d.ts` を見よ。
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
// 実体は wrangler.jsonc の alias が `.svelte-kit/cloudflare/_worker.js` に
// 差し替える。型は worker/sveltekit.d.ts が持つ。`pnpm build` が先に要る。
import sveltekit from "sveltekit-worker";

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
const mcp = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
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
  apiHandler: mcp,
  defaultHandler: sveltekit,

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
