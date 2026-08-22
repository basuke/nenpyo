/**
 * スパイク（#34）— OAuthProvider が SvelteKit の Worker を包めるか。
 *
 * OAuthProvider は Worker の default export を置き換える。SvelteKit が吐く
 * ハンドラを defaultHandler として渡し、/mcp と OAuth のエンドポイントだけを
 * 横から奪う形になるかを見る。
 *
 * **adapter-cloudflare は `main` の指す先に自分の生成物を書く。** そのままだと
 * このファイルが上書きされるので、アダプタには wrangler.svelte.jsonc を
 * 読ませて書き出し先を分けてある。
 */

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
// @ts-expect-error — SvelteKit のビルド成果物に型は無い。pnpm build が先に要る。
import sveltekit from "../.svelte-kit/cloudflare/_worker.js";

/** スパイクの間だけの MCP ハンドラ。トークンが通ったことだけを見せる。 */
const mcpHandler: ExportedHandler = {
  async fetch(request, env, ctx) {
    const props = (ctx as unknown as { props?: unknown }).props;
    return Response.json({ mcp: "reached", props: props ?? null });
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpHandler,
  defaultHandler: sveltekit as ExportedHandler,

  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",

  scopesSupported: ["timeline:read", "note:write", "event:write"],

  resourceMetadata: {
    resource: "https://nenpyo.net/mcp",
    authorization_servers: ["https://nenpyo.net"],
    scopes_supported: ["timeline:read", "note:write", "event:write"],
    resource_name: "年表.net",
  },

  clientIdMetadataDocumentEnabled: true,
});
