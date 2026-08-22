/**
 * `*.d1.test.ts` が使う型（docs/005-testing.md）。
 *
 * `cloudflare:test` の `env` は miniflare のバインディングで、
 * `vitest.config.ts` の `miniflare` に書いたものがそのまま入る。
 * `wrangler types` が作る `Cloudflare.Env` にはテスト専用のものが載らないので、
 * ここで足す。
 */

/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** migrations/ を読んだもの。applyD1Migrations() に渡す */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
