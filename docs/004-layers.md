# 層の分け方 — ロジックは lib に、ルートは入り口だけ

- 状態: 実装済み（#28）
- 前提: `docs/001-mvp.md`（技術スタック）、`docs/003-events-and-notes.md`（何を守るか）

## 1. なぜ分けるか

MVP を作りきった時点で、操作そのものが `+page.server.ts` の中にあった。
URL から実体を引く手続き、認可、業務ルール、入力の検証、画面へ渡す形への
詰め替え。どれも**どの入り口から来ても同じでなければならないもの**なのに、
入り口の側に置かれていた。

このまま API を足すと、同じチェックをもう一度書くことになる。
2 つあるものはいずれ片方だけが直る。そして直っていないほうが本番で通る。

だから逆にする。**操作は 1 つだけ置き、入り口を複数持つ。**

## 2. 層

```
src/lib/server/
  platform.ts   バインディングの取り出し
  db.ts         SQL だけ。ORM は入れない（001 の 3 章）
  auth.ts       セッションと OAuth
  errors.ts     AppError。lib が投げる唯一の型
  context.ts    AppContext と、URL の断片から実体を引き当てる resolve 系
  input.ts      plain object の検証
  actions/      操作（書き込み）
  views/        読み取り。画面に渡す形まで組む
  route.ts      SvelteKit との境目。AppError を error() / fail() / redirect() に翻訳する
src/routes/
  **/+page.server.ts   どの操作を呼ぶかと、成功したらどこへ行くか。それだけ
```

依存の向きは一方通行にする。

```
routes  →  route.ts  →  actions / views  →  context / input  →  db
```

`actions/` `views/` `context.ts` `input.ts` は **`@sveltejs/kit` を import しない。**
`error()` も `redirect()` も `fail()` も呼ばない。これは行儀の話ではなく、
**SvelteKit を経由しない呼び出し（API、バッチ、テスト）が同じ道を通れる**ための条件。

`actions/` と `views/` から `db.ts` を引くときは `import * as sql from "../db"` にする。
`sql.createEntry(...)` と書けば、その行がどの層を触っているかが名前で見える。

## 3. ルートに残ってよいもの

2 つだけ。

1. どの操作を呼ぶか
2. 成功したらどこへ行くか（リダイレクト先）

```ts
export const load: PageServerLoad = (event) =>
  page(event, (ctx) => timelineEditView(ctx, event.params));

export const actions: Actions = {
  save: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await updateTimeline(ctx, event.params, input);
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
```

`submit()` が `FormData` を plain object にして渡す。**検証はこの中ではなく
操作の中で走る。** ここで検証すると、API を足したときにもう 1 か所で
同じことを書くはめになる。

## 4. AppError — 判断は 1 つ、扱いは入り口ごと

lib は失敗を `AppError` で投げる。`kind` から HTTP の status が決まる。

| kind | status | フォーム | ページ | API |
|---|---|---|---|---|
| `invalid` | 400 | `fail()` で欄に戻す | エラーページ | JSON |
| `unauthenticated` | 401 | `/login?redirect=` へ | 同左 | JSON |
| `forbidden` | 403 | エラーページ | エラーページ | JSON |
| `notFound` | 404 | エラーページ | エラーページ | JSON |
| `conflict` | 409 | `fail()` で欄に戻す | エラーページ | JSON |

**同じ操作を通って同じ判断で同じエラーになる。違うのは扱いだけ。**
書き直して直るのは `invalid` と `conflict` だけなので、フォームに戻すのも
その 2 つだけ（`isRetryable`）。

`message` は人が読む日本語、`code` は機械が読む識別子（`slug_taken` /
`already_placed` / `not_bundleable` …）。**API のクライアントに message で
分岐させない。** 文言を直した瞬間に壊れる。

## 5. 参照は URL の params ではなく ref で渡す

```ts
type TimelineRef = { username: string; slug: string };
type EntryRef = TimelineRef & { entryId: string | number };
```

操作に SvelteKit の `params` を渡すと、API から呼ぶときに「params の形を
作る」という妙な仕事が要る。`@username/slug` は URL の都合ではなく年表その
ものの名前なので、これを参照の形にする。`entryId` が `string | number` なのは、
URL から来ると文字列、JSON から来ると数値だから。どちらも受けて中で揃える。

## 6. 絞り込みは検査ではない

画面は「束ねられる相手」だけを候補に出すし、「既に載っている年表」は塞ぐ。
これは親切であって、**守っているわけではない**。URL は直に叩ける。

だから同じ規則を 2 か所で通す。`views/` の絞り込みと、`actions/` の検査。
重複しているように見えるが、役割が違う。`views/` 側を消しても壊れないが、
`actions/` 側を消すと壊れる。

## 7. API を足すとき

`route.ts` に JSON 用の入り口を並べるだけで済む。操作には触らない。

```ts
export async function json(event, fn) {
  try {
    return Response.json(await fn(contextOf(event), await event.request.json()));
  } catch (cause) {
    if (!isAppError(cause)) throw cause;
    return Response.json(
      { error: { code: cause.code, message: cause.message } },
      { status: cause.status },
    );
  }
}
```

認証の方式（セッション Cookie を使い回すか、トークンを別に持つか）は
`contextOf` の中の話で、操作からは見えない。

## 8. 履歴

- 2026-08-21 #28 でこの形に整理。`+page.server.ts` の合計 500 行が 169 行になった
