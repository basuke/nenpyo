/**
 * SvelteKit のビルド成果物（`.svelte-kit/cloudflare/_worker.js`）の契約。
 *
 * **わざと実体を import していない。** あれは生成された JavaScript で、
 * `tsconfig` の `checkJs` が効くと svelte-check が中身まで追いかけて
 * 1000 件のエラーを出す。`exclude` は import 経由には効かない。
 *
 * そこで型はこの宣言から取り、実体はバンドラに差し替えさせる
 * （`wrangler.jsonc` の `alias`）。**生成物は中身の分からない箱として扱う**
 * のが正しく、外から見えるのは「fetch を持つハンドラ」であることだけ。
 */
declare module "sveltekit-worker" {
  const handler: ExportedHandler;
  export default handler;
}
