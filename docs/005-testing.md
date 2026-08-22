# テストの分け方 — 大枠は D1 を知らない、最低限だけが知っている

- 状態: 実装済み（#32）
- 前提: `docs/004-layers.md`（層の分け方）

## 1. きっかけ

#29（束ねからイベントを切り離すと 500）が、**単体テストでは原理的に
捕まえられない形**だった。`detachEvent` の SQL は一本一本どれも正しく、
壊れていたのは実行の順序と `UNIQUE (timeline_id, event_id)` の噛み合わせだけ。
`migrations/0005` で制約を足したときに、それより前（#23）に書かれた
`detachEvent` の前提が変わったことに、気づける仕組みが無かった。

しかもこれは「たまに落ちる」ではなく**切り離しが一度も通らない**状態で、
0005 を入れてから #29 で見つかるまでそのまま残っていた。

## 2. 分け方

`docs/004-layers.md` で「SQL は `db.ts` に集約する」を徹底したので、
そこがそのまま切れ目になる。**上は D1 を知らない、下だけが知っている。**

| | 大枠 | 最低限 |
|---|---|---|
| ファイル | `*.test.ts` | `*.d1.test.ts` |
| プロジェクト | `unit` | `d1` |
| 走る場所 | node | workerd + miniflare |
| 対象 | `actions/` `context.ts` `input.ts` と純粋関数 | `db.ts` |
| 何を見るか | 誰が通れるか・何を弾くか・どのエラーになるか | SQL と制約の噛み合わせ |
| 速さ | 全部で 0.2 秒 | 1.5 秒 |

`pnpm test` で両方、`pnpm test:unit` / `pnpm test:d1` で片方だけ走る。

## 3. 大枠は `db.ts` を丸ごと差し替える

```ts
vi.mock("../db");
```

SQL は一切見ない。見るのは **#28 の前提そのもの**、つまり認可も検証も
「操作の中」で済んでいること。ここが崩れていると、同じ操作を API から
呼んだときに素通りする。

```ts
it("refuses a signed-in stranger, and never reaches the write", async () => {
  await expect(updateTimeline(ctxOf(STRANGER), REF, VALID))
    .rejects.toMatchObject({ kind: "forbidden", code: "not_owner" });
  expect(sql.updateTimeline).not.toHaveBeenCalled();
});
```

`code` で照合して `message` では照合しない。文言を直した瞬間に壊れるので。

**「書き込みが呼ばれていないこと」を見るテストが多い**ので、`unit` 側は
`clearMocks: true` にしてある。これが無いと、呼び出しの記録がテストを
またいで残って通ってしまう。

### 大枠で捕まえられないもの

**SQL の中身、実行順、DB の制約。** D1 に繋がない以上、制約は存在しない。
#29 は大枠側では原理的に捕まらない。だから下がいる。

## 4. 最低限は本物の D1 に当てる

`migrations/` の 5 本をそのまま流す。テスト用のスキーマを別に持つと、
**#29 のように「マイグレーションが既存コードの前提を壊す」事故が素通りする。**

```ts
beforeAll(() => applyD1Migrations(db, env.TEST_MIGRATIONS));
```

初期データ（`pnpm data:import`）は使わない。720 件は要らないし、
テストごとに必要な行だけ作るほうが「何を試しているか」が読める。
テーブルは各テストの前に空にする。

対象は **`timeline_entry_events` を組み替える 4 つ**と、ノートを複製する
`updateEntry`。

| | 見ていること |
|---|---|
| `detachEvent` | 元の行から外してから新しい行へ挿す（#29）／ノートは共有される |
| `addEventToEntry` | 足したあと日付順に振り直され、先頭が位置を決める |
| `mergeEntries` | 日付順にまとまる／新しいノートを書くと元の 2 本が来歴に残る |
| `placeEntry` | event は複製されない／同じ年表に二度は載らない |
| `updateEntry` | 参照が 2 本あるノートは複製される／1 本なら その場で書き換わる |

読み取り（`listEntries` など）は入れていない。壊れれば画面ですぐ分かる。

### 再発防止が効いていることを確かめてある

`detachEvent` の 2 行の順序を元に戻すと、`d1` の 3 件が
`UNIQUE constraint failed` で落ちる。直すと通る。**落ちることを確認していない
回帰テストは、回帰テストではない。**

## 5. CI

`pnpm test` が両方を走らせるので、CI もそのまま両方走る。

触るのは **miniflare のローカル D1** で、本番の年表には一切触らない。
`CLAUDE.md` 6 章の「初期データの投入は CI に載せない」とは別の話で、
あれは `pnpm data:import` が**本番の**年表を丸ごと入れ替えるという話。

## 6. 使っているもの

`@cloudflare/vitest-pool-workers`。v3 から設定の書き方が変わっていて、
`defineWorkersProject` は `cloudflareTest()` という Vite プラグインになった。

`wrangler.jsonc` は読ませていない。あれの `main` は `.svelte-kit` の
ビルド成果物を指していて、**テストのたびに `pnpm build` が要る**ことになる。
見たいのは `db.ts` と D1 の噛み合わせだけなので、D1 バインディングと
マイグレーションだけを `vitest.config.ts` に直に書いている。

`SELF`（実際の Worker に fetch する外形テスト）は使っていない。必要に
なったら `main` を足せば使えるが、そのときはビルドとの前後関係が要る。

## 7. これから

- `route.ts` の翻訳（`AppError` → `fail()` / `error()` / `redirect()`）は
  まだテストしていない。API を足すときに、JSON 側の入り口と一緒に見るのがよい
- API を足したら、同じ操作が UI からも API からも同じエラーになることは
  大枠側で見られる。入り口ごとに操作を呼ぶだけなので

## 8. 履歴

- 2026-08-21 #32 でこの形に。大枠 20 件（`actions/` 分）と D1 側 9 件を足した
