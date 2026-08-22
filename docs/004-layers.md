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

## 5. 層をまたぐ形には名前を付ける

`views/` と `actions/` の戻り値は、**そのままページが受け取る `data` であり、
API のレスポンスの契約でもある**。推論に任せると、他所から指せないし、
うっかり形が変わっても誰も気づかない。だから名前を付ける。

```ts
export type TimelineView = {
  owner: OwnerView;
  timeline: { slug: string; title: string; description: string | null; updatedAt: string };
  years: YearGroup[];
  entryCount: number;
  canEdit: boolean;
  canPlace: boolean;
};

export async function timelineView(ctx: AppContext, ref: TimelineRef): Promise<TimelineView> {
```

`interface` ではなく `type` にするのは、`ErrorKind` や `PlacedNote` のような
union と書き方を揃えるため。宣言のマージが要る `app.d.ts` の
`declare global` だけが `interface`。

### 同じ形は 1 か所でだけ宣言する

`EntryInput` が `db.ts` と `input.ts` の両方にあった。構造が同じなので
コンパイルは通ってしまうが、名前が 2 つある時点で 2 つに割れている。
**検証を通った値の形は、それを書き込む側（`db.ts`）が持つ。**
`input.ts` はそこへ import して、`parseEntryInput` の戻り値に使う。

### DB の行をそのまま外へ出さない

名前を付けたことで、一覧ページが `TimelineWithOwner` を、年表ページが
`TimelineEntry` をそのまま渡していたのが見えた。`owner_username` や
`avatar_url` という **SQL の都合の列名が、画面と、いずれ API のレスポンスに
そのまま出る**。`views/common.ts` の `toTimelineCard` / `toPersonView` で
詰め替える。

### 受け取る型と、返す型を分ける

`Id = string | number` は**受け取るときだけ**の型。URL から来ると文字列、
JSON から来ると数値なので両方受けて `toId` で揃える。返すほうは `number`。
出ていく値まで曖昧なままにすると、受け手がもう一度整えることになる。

逆に `TimelineRef` は引数と戻り値の両方で使う。「どこを指しているか」と
「次にどこを指せばよいか」は同じことなので、型を分ける理由がない。

## 6. 参照は URL の params ではなく ref で渡す

```ts
type TimelineRef = { username: string; slug: string };
type EntryRef = TimelineRef & { entryId: string | number };
```

操作に SvelteKit の `params` を渡すと、API から呼ぶときに「params の形を
作る」という妙な仕事が要る。`@username/slug` は URL の都合ではなく年表その
ものの名前なので、これを参照の形にする。`entryId` が `string | number` なのは、
URL から来ると文字列、JSON から来ると数値だから。どちらも受けて中で揃える。

## 7. 絞り込みは検査ではない

画面は「束ねられる相手」だけを候補に出すし、「既に載っている年表」は塞ぐ。
これは親切であって、**守っているわけではない**。URL は直に叩ける。

だから同じ規則を 2 か所で通す。`views/` の絞り込みと、`actions/` の検査。
重複しているように見えるが、役割が違う。`views/` 側を消しても壊れないが、
`actions/` 側を消すと壊れる。

## 8. API を足すとき（実装済み — `docs/006-api.md`）

`route.ts` に JSON 用の入り口を並べるだけで済んだ。操作には触っていない。

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
`contextOf` の中の話で、操作からは見えない。UI 向けは Cookie を使い回した。
MCP 向けのトークンは #34 で決める。

## 9. 履歴

- 2026-08-21 #28 でこの形に整理。`+page.server.ts` の合計 500 行が 169 行になった
- 2026-08-21 同 PR で、層をまたぐ戻り値に名前を付けた（5 章）。
  `EntryInput` の二重定義と、一覧・年表ページへの DB 行の素通しもここで直した
- 2026-08-22 #36 で JSON API を足した。8 章の見立てどおり、入り口だけで済んだ
