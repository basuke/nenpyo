/**
 * テストは 2 つに分かれている（docs/005-testing.md）。
 *
 *   unit … D1 に繋がない。認可・検証・エラーの種類など、**操作の大枠**を見る。
 *          node で走るので速い。`src/**' + '/*.test.ts`
 *   d1   … 実物の D1（miniflare）に繋ぐ。SQL と制約の噛み合わせだけを見る。
 *          workerd で走るので遅い。`src/**' + '/*.d1.test.ts`
 *
 * 分ける根拠は #29。あれは SQL 一本一本は正しく、実行の順序と
 * UNIQUE 制約の噛み合わせだけが壊れていた。**大枠のテストでは原理的に
 * 捕まらない**ので、そこだけ本物の DB に当てる。
 */

import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const alias = { $lib: path.resolve("./src/lib") };

// migrations/ をそのまま流す。テスト用のスキーマを別に持つと、
// #29 のように「マイグレーションが既存コードの前提を壊す」事故が素通りする。
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.d1.test.ts"],
          environment: "node",
          // 「書き込みが呼ばれていないこと」を見るテストが多いので、
          // 呼び出しの記録がテストをまたいで残らないようにする。
          clearMocks: true,
        },
      },
      {
        plugins: [
          cloudflareTest({
            // wrangler.jsonc は読ませない。あれの main は .svelte-kit のビルド成果物を
            // 指していて、テストのたびに pnpm build が要ることになる。ここで見たいのは
            // db.ts と D1 の噛み合わせだけなので、必要な結び付けだけを書く。
            miniflare: {
              d1Databases: ["DB"],
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        resolve: { alias },
        test: { name: "d1", include: ["src/**/*.d1.test.ts"] },
      },
    ],
  },
});
