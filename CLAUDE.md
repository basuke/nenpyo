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
- `docs/003-events-and-notes.md` — イベントとノートの分離、entry、CoW
- `docs/004-layers.md` — 層の分け方。ロジックは lib に、ルートは入り口だけ
- `docs/005-testing.md` — テストの分け方。大枠は D1 を知らない、最低限だけが知っている
- `docs/006-api.md` — JSON API。読みは公開、書きは Cookie で同一オリジン専用
- `docs/007-mcp.md` — MCP サーバー。OAuth 2.1、スコープ、tool

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

## 3. 用語

日本語で書くときの呼び方を揃える。**`読み` は使わない** — 仮名読み（ふりがな）の
標準的な語で、日本語のタイトルを並べ替える列がいずれ要ることを考えると衝突する。

| 呼び方 | 指すもの |
|---|---|
| **ノート** | `notes` の 1 行。キャッチコピーと説明をまとめた、誰かが**自分のものとして載せた見方**。書いたのが本人とは限らない（`docs/003` 5 章） |
| **キャッチコピー** | `notes.tagline`。ひとことの言い回し |
| **説明** | `notes.body` |
| **束ね** | 1 つの entry が複数のイベントを指している状態（compound） |
| **見方** | 事実に対する主観のこと。分類の話をするときに使う |
| **持ち主** | そのノートを自分の年表に載せている人（`notes.author_id`）。**「書いた人」ではない** |
| **載せる** | 他人の年表にある出来事を、自分の年表にも置くこと。**画面に出す言葉はこちら** |
| **参照** | その仕組みの側の呼び方。`events` は複製されず、両方の年表が同じ行を指す |

`引用` は使わない。文章を引く行為に聞こえて、ノートだけの話に見えてしまう。
実際に起きているのは出来事を自分の年表にも載せることで、ノートはその付属物。

## 4. コーディング規約

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
- `actions/` `views/` から引くときは `import * as sql from "../db"`。
  その行がどの層を触っているかを名前で見せる
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

### 層（`docs/004-layers.md`）

**ロジックはルートに置かない。`src/lib/server/` に置く。**
`+page.server.ts` に残ってよいのは「どの操作を呼ぶか」と
「成功したらどこへ行くか」の 2 つだけ。

```
routes  →  route.ts  →  actions / views  →  context / input  →  db
```

- `actions/`（書き込み）と `views/`（読み取り）は **`@sveltejs/kit` を import しない**。
  `error()` も `redirect()` も `fail()` も呼ばない。失敗は `AppError` を投げる。
  SvelteKit を経由しない呼び出し（API、テスト）が同じ道を通れるようにするため
- 認可は `src/lib/server/context.ts` の `require*` に寄せる。
  ルートで直接 `locals.user` を判定しない
- 検証は `src/lib/server/input.ts`。**`FormData` ではなく plain object を受ける。**
  検証は操作の中で走らせる。ルートで走らせると API から呼んだときに素通りする
- `AppError` を HTTP に翻訳するのは `src/lib/server/route.ts` だけ。
  画面は `page()` / `submit()`、API は `json()`、MCP は tool。**同じ操作を呼ぶ**
- **`worker/` は SvelteKit ではない。** Worker の入口。ビルド成果物は直に
  import せず、型は `worker/sveltekit.d.ts`・実体は wrangler の `alias` から
  取る。直に import すると svelte-check が生成物まで型検査する
  （`docs/007-mcp.md` 4 章）
- **Worker の型を触ったら `npx wrangler types` を流してから typecheck する。**
  `worker-configuration.d.ts` は gitignore されていて CI は作り直すので、
  手元が古いと**ローカルで通って CI で落ちる**
- API に **CORS を開けない。** Cookie 認証の前提が崩れる（`docs/006-api.md` 2 章）
- **`views/` と `actions/` の戻り値には名前を付ける**（`Promise<TimelineView>`）。
  その形はページが受け取る `data` であり、API のレスポンスの契約でもある
- **DB の行をそのまま外へ出さない。** `owner_username` のような SQL の都合の
  列名が画面と API に漏れる。`views/common.ts` の `to*View` で詰め替える
- 同じ形を 2 か所で宣言しない。検証を通った入力の形は `db.ts` が持ち、
  `input.ts` はそれを import して戻り値に使う
- 新しい操作を足すときは、まず `actions/` に置いてからルートを繋ぐ。逆をやらない

### SvelteKit / Svelte

- Svelte 5 の runes（`$props()` / `$derived()` / `$state()`）を使う
- `error()` / `redirect()` は `throw` する
- 読むだけのページは `export const csr = false;` を**理由のコメント付きで**置く
- CSS クラスは BEM 風（`field__hint`）

### テスト（`docs/005-testing.md`）

vitest。テストは対象と同じ場所に置く。**2 つに分かれている。**

| | 大枠 | 最低限 |
|---|---|---|
| | `*.test.ts` | `*.d1.test.ts` |
| 走る場所 | node（速い） | workerd + miniflare（遅い） |
| 対象 | `actions/` `context.ts` `input.ts` と純粋関数 | `db.ts` |
| 何を見るか | 誰が通れるか・何を弾くか・どのエラーになるか | SQL と制約の噛み合わせ |

- **大枠は `vi.mock("../db")` で `db.ts` を丸ごと差し替える。** SQL は見ない。
  認可も検証も「操作の中」で済んでいることを見る。
  「書き込みが呼ばれていないこと」を必ず添える（`expect(sql.x).not.toHaveBeenCalled()`）
- **`code` で照合し、`message` では照合しない。** 文言を直した瞬間に壊れる
- **D1 を触るのは `db.ts` を試すときだけ。** 対象は
  `timeline_entry_events` を組み替える 4 つと、ノートを複製する `updateEntry`。
  ここが #29 の壊れ方をしうる場所で、大枠側では原理的に捕まらない
- D1 側は `migrations/` をそのまま流す。テスト用のスキーマを別に持つと、
  マイグレーションが既存コードの前提を壊す事故が素通りする
- **回帰テストは、落ちることを確認してから入れる。** 直す前の状態に戻して
  実際に落ちなければ、それは回帰テストではない
- 検証しているのが「何であって、なぜか」が読み取れる `it` の名前を書く

## 5. コマンド

```
pnpm dev                  開発サーバ
pnpm test                 vitest（両方）
pnpm test:unit            大枠だけ（D1 に繋がない・速い）
pnpm test:d1              D1 に繋ぐものだけ
pnpm typecheck            svelte-check
pnpm build                本番ビルド
pnpm preview              build して wrangler dev
pnpm preview:mcp          同上。https で立てる（MCP を試すとき）

pnpm db:migrate:local     マイグレーション適用（ローカル D1）
pnpm db:migrate           同（本番 D1）
pnpm data:convert         元データを SQL に変換
pnpm data:check           仕分け表（curation/）が元データと整合しているか
pnpm data:import:local    投入（ローカル）
```

パッケージマネージャは **pnpm**。npm / yarn は使わない。

## 6. 気をつけること

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
