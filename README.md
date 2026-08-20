# nenpyo.net

関心年表。要件は [`docs/001-mvp.md`](docs/001-mvp.md)。

[SvelteKit](https://svelte.dev/docs/kit) を [Cloudflare Workers](https://developers.cloudflare.com/workers/)
の上で動かし、データは [D1](https://developers.cloudflare.com/d1/)（SQLite）に置いている。
ORM は入れず生 SQL で書く。

## セットアップ

```bash
pnpm install
pnpm cf-typegen            # worker-configuration.d.ts を生成
pnpm db:migrate:local      # ローカル D1 にスキーマを流す
pnpm data:convert          # 元データを取得して data/ に変換結果を出す
pnpm data:import:local     # ローカル D1 に 720 件を投入
```

GitHub OAuth を使うので、ローカルでは `.dev.vars` を用意する（`.dev.vars.example` を参照）。

```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

開発用と本番用で別々のアプリを登録する。1 つのアプリに callback URL を
10 個まで並べられるので技術的には 1 つで足りるが、共用すると開発機に置く
client secret が本番と同じものになるため、分けている。

- 本番: `https://nenpyo.net/auth/github/callback`
- 開発: `http://localhost:5173/auth/github/callback`

作り方と、どのアプリが何なのかの台帳は [`docs/002-github-oauth.md`](docs/002-github-oauth.md)。

## 開発

```bash
pnpm dev       # http://localhost:5173
```

`vite dev` でも adapter-cloudflare が D1 をエミュレートするので、
本番と同じ経路（`platform.env.DB`）でローカル D1 に触れる。

```bash
pnpm test        # ユニットテスト
pnpm typecheck   # svelte-check
pnpm preview     # 本番ビルドを wrangler dev で動かす
```

CSRF の検証は本番ビルドでのみ働く（SvelteKit が dev では意図的に飛ばす）。
その手の確認は `pnpm preview` 側で行うこと。

## データベース

```bash
pnpm db:migrate:local   # ローカルに適用
pnpm db:migrate         # 本番に適用
```

マイグレーションは `migrations/` に生 SQL で置く。
本番への適用は CI（main への push）でも自動で走る。

## 初期データ

松尾公也さんの [SF・コンピューター技術ライフライン](https://github.com/matsuo-koya/sf-tech-lifeline)（MIT）
720 件を `/@matsuo-koya/sf-tech-lifeline` に投入している。

```bash
pnpm data:convert       # 取得 → 変換（data/ に JSON と SQL を出す）
pnpm data:import        # 本番 D1 に投入（流し直すと入れ替わる）
```

`data/` は成果物なので commit しない。元データはコミット SHA で固定している
（`scripts/convert-lifeline.mjs` の `SOURCE_COMMIT`）。

## デプロイ

```bash
pnpm deploy     # ビルドして wrangler deploy
```

`.github/workflows/deploy.yml` が main への push で

1. 型チェックとテスト
2. D1 マイグレーションの適用
3. ビルドとデプロイ

を行う。必要な GitHub secret は `CLOUDFLARE_API_TOKEN` のみ
（account_id は `wrangler.jsonc` に固定）。

Worker 側の secret は wrangler で設定する。

```bash
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
```

secret を作り直す手順は [`docs/002-github-oauth.md`](docs/002-github-oauth.md) の 7 章。

## URL

```
/                                       全タイムライン一覧
/login  /logout  /auth/github/callback  認証
/@{username}                            ユーザーの年表一覧
/@{username}/-/new                      年表をつくる
/@{username}/{slug}                     年表本体
/@{username}/{slug}/-/edit              年表を編集
/@{username}/{slug}/-/events/new        イベントを追加
/@{username}/{slug}/-/events/{id}/edit  イベントを編集
```

ユーザー名に `@` を前置してアプリ側のパスと名前空間を分けているので、
予約語リストを持たなくても `/login` などと衝突しない。
ユーザー配下のアプリ機能は GitLab 方式で `/-/` を挟む。

## 公開範囲

いまは全体 `noindex`。閲覧は誰でもできるが、サインアップは
`allowed_github_ids` テーブルの allowlist で絞っている。

```bash
pnpm exec wrangler d1 execute nenpyo --remote \
  --command "INSERT INTO allowed_github_ids (github_id, note) VALUES (123, 'name');"
```

## ドキュメント

- [`docs/001-mvp.md`](docs/001-mvp.md) — 要件定義。何をなぜこう作ったか
- [`docs/002-github-oauth.md`](docs/002-github-oauth.md) — OAuth App の作り方と台帳
