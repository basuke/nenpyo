# GitHub OAuth App の記録

作成日: 2026-08-19
ステータス: 運用中の記録（作ったら追記する）

このファイルは**何をなぜ作ったかの台帳**です。半年後に見て思い出せることを目的にしています。
設定を変えたり作り直したりしたら、末尾の履歴に 1 行足してください。

---

## 1. なぜ GitHub OAuth なのか

URL にユーザー名を含める設計（`/@{username}/{slug}`）を採ったので、
ユーザー名の一意性が必要になります。GitHub のアカウント名空間をそのまま借りることで、
その管理を自前で持たずに済ませています。想定する初期ユーザーは全員 GitHub アカウント持ちです。

内部の不変キーは GitHub の**数値 ID**（`github_id`）で、ユーザー名は表示・URL 用の
可変フィールドとして別に持っています。GitHub のユーザー名は本人が変更できるためです。

詳しくは [`001-mvp.md`](001-mvp.md) の 4 章。

## 2. なぜ「GitHub App」ではなく「OAuth App」なのか

やりたいのは「この人が誰かを知る」ことだけで、リポジトリを読むわけではありません。

- **OAuth App** — ユーザー単位の認可。インストールという概念がなく、同意画面が 1 枚。
- **GitHub App** — リポジトリ単位の細かい権限とインストール手続きが付く。今回は要らない。

権限が要らない用途に GitHub App を使うと、ユーザー側に「インストール」という
余計な手続きが生えるだけなので、OAuth App を選んでいます。

## 3. なぜ 2 つ作るのか

**資格情報を環境ごとに分けるため**です。

技術的には 1 つで足ります。OAuth App の callback URL は**10 個まで登録できる**ので、
本番とローカルの両方を 1 つのアプリに並べることは可能です。

それでも分けるのは、1 つのアプリを共用すると、開発機の `.dev.vars` に置く
client secret が**本番と同じもの**になるからです。開発機から漏れた時点で
本番の認証が抜かれます。開発用の資格情報で本番を認可できない状態にしておく、
というだけの話で、プラットフォームの制約ではありません。

| | 本番 | ローカル |
|---|---|---|
| Homepage URL | `https://nenpyo.net` | `http://localhost:5173` |
| Authorization callback URL | `https://nenpyo.net/auth/github/callback` | `http://localhost:5173/auth/github/callback` |
| client id / secret の置き場 | Workers の secret | `.dev.vars`（commit しない） |

ローカルのポート `5173` は Vite の既定値です。変えたら callback URL も揃えてください。

## 4. なぜスコープを要求しないのか

**scope パラメータを一切送っていません**（`src/lib/server/auth.ts` の `beginOAuth`）。

スコープなしで発行されたトークンでも `GET /user` は通り、必要な 4 つ——
数値 ID・login・表示名・アバター URL——は取れます。
リポジトリへのアクセス権を求めないぶん、同意画面が軽くなり、許可のハードルが下がります。

「あとで必要になるかもしれないから `read:user` くらい付けておく」はやりません。
要らない権限を持たないこと自体が設計です。

## 5. 作る手順

両方とも https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**。

### 5.1 本番用

| 欄 | 値 |
|---|---|
| Application name | `nenpyo.net` |
| Homepage URL | `https://nenpyo.net` |
| Application description | 関心年表 nenpyo.net のログイン用 |
| Authorization callback URL | `https://nenpyo.net/auth/github/callback` |
| Enable Device Flow | オフ |

作成後、**Client ID** を控え、**Generate a new client secret** で secret を発行します。
secret は**その画面を離れると二度と見られません**。すぐ下の登録まで一気にやってください。

```bash
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
```

登録できたか確認:

```bash
pnpm exec wrangler secret list
```

### 5.2 ローカル用

| 欄 | 値 |
|---|---|
| Application name | `nenpyo.net (local)` |
| Homepage URL | `http://localhost:5173` |
| Application description | 開発用。ローカルからのログイン確認に使う |
| Authorization callback URL | `http://localhost:5173/auth/github/callback` |
| Enable Device Flow | オフ |

`.dev.vars.example` をコピーして値を入れます。

```bash
cp .dev.vars.example .dev.vars
# GITHUB_CLIENT_ID と GITHUB_CLIENT_SECRET を書く
```

`.dev.vars` は `.gitignore` 済みです。**commit しないこと。**

### 5.3 チェックボックス 3 つ

作成画面に並ぶトグルの意味と、うちでの設定。

| 項目 | 設定 | 意味と理由 |
|---|---|---|
| Allow wildcard matching | **オフ** | オンにすると、ホスト（サブドメインを除く）とポートさえ合えば、callback URL の**サブディレクトリやサブドメイン**への `redirect_uri` が通るようになる。GitHub 自身が「攻撃者が任意のサブドメイン・サブディレクトリへ認可コードを送れるようになる」と警告している。うちの callback は 1 本きりで緩める理由がない |
| Enable Device Flow | **オフ** | ブラウザのリダイレクトを受けられない機器（CLI、テレビ）向けの認可方式。`github.com/login/device` にコードを入力してもらい、アプリ側はポーリングで待つ。うちは普通の Web アプリなので、使わない認可経路が増えるだけ |
| Expire user access tokens | **オン（既定のまま）** | アクセストークンが 8 時間、リフレッシュトークンが 6 か月で失効する。**うちには実質的な影響がない**——GitHub のトークンを保存していないため（`completeOAuth` で受け取り、その場で `GET /user` に使って捨てている）。ログイン状態は D1 の `sessions` が保っており、GitHub のトークンとは無関係。既定であり安全側なので、そのままにする |

### 5.4 動作確認

```bash
pnpm dev
```

http://localhost:5173/login を開いて GitHub の同意画面に飛び、
戻ってきて `/@{自分のユーザー名}` に着けば通っています。

同意画面に「このアプリは公開情報にのみアクセスします」といった趣旨の表示が出るはずです。
リポジトリの権限を求める文言が出たら、スコープが混入しています。

## 6. 台帳

**client secret はここに書かないこと。** Client ID は公開情報なので書いて構いません。

### 本番用

| 項目 | 値 |
|---|---|
| Application name | `nenpyo.net` |
| Client ID | _（作成後に記入）_ |
| 所有者 | _（個人 basuke / Organization のどちらか記入）_ |
| 作成日 | _（記入）_ |
| callback URL | `https://nenpyo.net/auth/github/callback` |
| secret の置き場 | Cloudflare Workers の secret（`nenpyo-net`） |

### ローカル用

| 項目 | 値 |
|---|---|
| Application name | `nenpyo.net (local)` |
| Client ID | _（作成後に記入）_ |
| 所有者 | _（記入）_ |
| 作成日 | _（記入）_ |
| callback URL | `http://localhost:5173/auth/github/callback` |
| secret の置き場 | 各自の `.dev.vars`（共有しない） |

**所有者について**: 個人アカウントで作ると、secret を回せるのがその人だけになります。
いまは共同制作者が松尾さん 1 人なので個人で困りませんが、人が増えたら
Organization に移すことを検討してください（OAuth App は所有者を移管できます）。

## 7. secret を作り直すとき

漏れた疑いがあるとき、担当者が変わるとき、定期的に回すとき。

1. OAuth App の設定画面で **Generate a new client secret**
2. `pnpm exec wrangler secret put GITHUB_CLIENT_SECRET` で新しい値を登録
3. 本番でログインできることを確認
4. **確認できてから**古い secret を Delete
5. 末尾の履歴に 1 行足す

古いものを先に消すとログインが止まります。順番を守ってください。

なお secret を差し替えても、既存のログインは切れません。
セッションは D1 の `sessions` テーブルに独立して載っているためです。
全員を強制ログアウトしたいなら別途:

```bash
pnpm exec wrangler d1 execute nenpyo --remote --command "DELETE FROM sessions;"
```

## 8. うまくいかないとき

| 症状 | 原因 |
|---|---|
| `redirect_uri_mismatch` | callback URL がアプリの設定と 1 文字でも違う。末尾のスラッシュ、`http`/`https`、ポート番号を見る |
| `/login` が 500 で「GITHUB_CLIENT_ID と…を設定してください」 | secret が未登録。本番なら `wrangler secret put`、ローカルなら `.dev.vars` |
| ログイン後に `/pending` に飛ぶ | allowlist に載っていない。仕様どおりの挙動（下記） |
| `OAuth の state が一致しません` | state Cookie の期限切れ（10 分）。もう一度 `/login` から |
| ローカルでログインが保持されない | `.dev.vars` を変えたら dev サーバーを再起動する |

## 9. allowlist に人を足す

OAuth を通っても、`allowed_github_ids` に載っていない人は `/pending` に着きます。
クローズド運用は招待制であって締め出しではないので、拒否ではなく「準備中」を返しています。

```bash
# 数値 ID を調べる
gh api users/{username} --jq '.id'

# 本番に足す
pnpm exec wrangler d1 execute nenpyo --remote \
  --command "INSERT INTO allowed_github_ids (github_id, note) VALUES (123456, 'username / 表示名');"
```

登録済み: `42601`（basuke）, `235002527`（matsuo-koya）

## 10. 履歴

設定を変えたら 1 行足してください。

| 日付 | できごと |
|---|---|
| 2026-08-19 | このドキュメントを作成。アプリ本体は未作成 |
| 2026-08-19 | 3 章を訂正。callback URL は 10 個まで登録でき、2 つ作るのは制約ではなく資格情報を分けるため。5.3 にチェックボックスの説明を追加 |
