# CLAUDE.md

年表.net — 誰でも年表を作って共有できるサービス。SvelteKit + Cloudflare Workers + D1。

このファイルには**開発の進め方とコーディング規約**だけを書く。
アプリそのものの設計・仕様は `docs/` にある。

## 1. どこに何を書くか

| | 置き場 | 性質 |
|---|---|---|
| 決まったこと、長期に効く前提 | `docs/NNN-*.md` | 閉じない。育てる |
| 決める過程、やること | GitHub Issue | 生もの。閉じる |
| 開発の進め方、コーディング規約 | このファイル | 育てる |

**`type:design` の Issue を閉じるときは、結論が `docs/` のどこに入ったかを本文に書いてから閉じる。**
議論の経緯は Issue に残り、結論は docs に残る。これを守らないと、
なぜそうなっているかが誰にも辿れなくなる。

現在の docs:

- `docs/001-mvp.md` — MVP の全体設計。スキーマ、URL 設計、認証、データ投入
- `docs/002-github-oauth.md` — GitHub OAuth の実装
- `docs/003-events-and-notes.md` — イベントと読み(Note)の分離、entry、CoW

## 2. Issue の運用

GitHub の Issue Types は Organization 専用でこのリポジトリでは使えないため、
**ラベル + タイトル接頭辞 + サブイシュー**の 3 つで種別を表す。

**`type:` ラベルは必ず 1 つだけ付ける。**

| ラベル | 意味 |
|---|---|
| `type:epic` | まとまった仕事の束。単体では着手しない |
| `type:task` | 実際に手を動かす単位 |
| `type:bug` | 壊れているものの修正 |
| `type:design` | 設計の議論。結論が出たら docs/ に落として閉じる |

補助に `area:schema` / `area:data` / `area:ui` / `area:auth` / `area:infra`。

- **Epic だけタイトルに `[Epic] ` を付ける。** タスクとバグには付けない。
  ラベルが見えない場所（検索結果、PR からのリンク、通知メール）で Epic を見分けるため。
- **Epic と Task はサブイシューで繋ぐ**（本文のチェックリストではなく）。
  `gh api graphql` の `addSubIssue` を使う。進捗バーが自動で出る。

## 3. コーディング規約

フォーマッタ（prettier / eslint）は入れていない。以下は手で揃える。

### 言語の使い分け

- **識別子は英語**、**コメント・JSDoc・ユーザーに見える文言は日本語**
- **テスト名（`describe` / `it`）は英語** — `it("rejects a leading hyphen so it can never collide with /-/")`
- `throw error(404, "@foo は見つかりません")` のように、投げるメッセージも日本語

### コメントは「なぜ」を書く

何をしているかはコードを読めば分かる。**そう決めた理由**を書く。
判断の根拠が docs にあるなら、章まで指して参照する。

```ts
// 読むだけのページなので、クライアント側では何もしない。
// 有効にしておくと 720 件分のデータがハイドレーション用の JSON として
// 本文と二重に載り、転送量がそのまま倍になる。
export const csr = false;
```

```ts
/**
 * タイムラインの slug。
 *
 * 先頭が英数字なので、URL のアプリ機能側に使う `/-/` と原理的に衝突しない
 * （docs/001-mvp.md 5 章）。
 */
```

ファイル冒頭には、そのモジュールが何を引き受けているかを JSDoc ブロックで置く。

### 書式

- インデント 2 スペース、ダブルクォート、セミコロンあり
- 複数行の引数・配列・オブジェクトには trailing comma
- 長いファイルは `/* ── users ─────────────── */` で区切る

### データベース

- **ORM は入れない。生 SQL を書く**（`docs/001-mvp.md` 3 章）。
  後から構造を変える前提なので、SQLite の挙動が見えているほうが判断しやすい
- **SQL は `src/lib/server/db.ts` に集約する。** ルートから直接 `db.prepare()` を書かない
- 関数の第一引数は `db: D1Database`。名前付き export のみ、default export はしない
- 行の型は `UserRow` `EventRow` のように手書きし、**列名は snake_case のまま**持つ
- SQL は template literal でキーワードの桁を揃えて書く

```sql
INSERT INTO users (github_id, username, updated_at)
     VALUES (?, ?, ?)
ON CONFLICT (github_id) DO UPDATE SET
     username   = excluded.username,
     updated_at = excluded.updated_at
```

- **`load` の戻り値で camelCase に詰め替える。** DB 行をそのまま
  クライアントへ渡さず、そのページに必要な分だけ選んで返す

```ts
return {
  owner: { username: owner.username, displayName: owner.display_name },
  ...
};
```

- 日時は ISO 8601 (UTC) の TEXT。`now()` を使う
- スキーマ変更は `migrations/NNNN_*.sql` を足す。既存ファイルは編集しない。
  マイグレーションにも**なぜその変更が要るのか**を日本語コメントで書く

### SvelteKit / Svelte

- Svelte 5 の runes（`$props()` / `$derived()` / `$state()`）を使う
- 認可は `src/lib/server/guards.ts` に寄せる。ルートで直接 `locals.user` を判定しない
- `error()` / `redirect()` は `throw` する
- 読むだけのページは `export const csr = false;` を**理由のコメント付きで**置く
- CSS クラスは BEM 風（`field__hint`）

### テスト

- vitest。テストは対象と同じ場所に `*.test.ts` として置く
- **純粋関数をテストする。** D1 を触るコードのテストは今のところ書いていない
- 検証しているのが「何であって、なぜか」が読み取れる `it` の名前を書く

## 4. コマンド

```
pnpm dev                  開発サーバ
pnpm test                 vitest（一回実行）
pnpm typecheck            svelte-check
pnpm build                本番ビルド
pnpm preview              build して wrangler dev

pnpm db:migrate:local     マイグレーション適用（ローカル D1）
pnpm db:migrate           同（本番 D1）
pnpm data:convert         元データを SQL に変換
pnpm data:check           仕分け表（curation/）が元データと整合しているか
pnpm data:import:local    投入（ローカル）
```

パッケージマネージャは **pnpm**。npm / yarn は使わない。

## 5. 気をつけること

- **初期データの投入は CI に載せない。** `main` への push で走るのは
  マイグレーションとデプロイまで。`pnpm data:import` は年表の中身を
  丸ごと入れ替えるので、CI で毎回流すと**利用者が画面から直した内容が消える**。
  投入は入れ直しが要ると判断したときに手で流す
- **`data/` は gitignore されている。** 生成物の置き場なので、コミットされるものを
  ここに置かない。人が手で書いたデータ（仕分け表など）は `curation/` に置く。
  `data/` は `pnpm data:convert` でいつでも作り直せる、が判断の基準
- **`touchTimeline()` を忘れない。** 一覧は `timelines.updated_at` の降順なので、
  配下のイベントを変更したらタイムライン側も動かす
- **イベントの並び順**は year → month → day → hour → minute → id の昇順。
  下位が NULL の行は SQLite の既定で先頭に来る。これが仕様と一致している
- `slug` は先頭が英数字。これで URL のアプリ機能側 `/-/` と衝突しない
- **`main` に直接コミットしない。** ブランチを切って PR を通す
