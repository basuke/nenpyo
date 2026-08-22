import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // アダプタの書き出し先だけを別設定で指す（#34 のスパイク）。
    adapter: adapter({ config: "wrangler.svelte.jsonc" }),
  },
};
