/**
 * 操作の足場。
 *
 * `AppContext` は「誰が、どの DB に対して」だけを持つ。入り口が HTTP か
 * どうかも、Cookie もヘッダも知らない。SvelteKit の `RequestEvent` から
 * これを作るのは境目の仕事で、`route.ts` が引き受ける（docs/004-layers.md）。
 *
 * ここに置く resolve 系は、**URL の断片から実体を引き当てて、その人に
 * 許されているかまで見る**。ルートごとに書かれていた `loadEntry` /
 * `loadPair` / `loadSource` が集まったもの。
 */

import { forbidden, invalid, notFound, unauthenticated } from "./errors";
import { bundleable } from "$lib/period";
import type { SessionUser } from "./auth";
import * as sql from "./db";
import type { TimelineEntry, TimelineWithOwner, UserRow } from "./db";

export type AppContext = {
  db: D1Database;
  /** ログインしていなければ null。要るかどうかは操作ごとに違う */
  user: SessionUser | null;
};

/**
 * 入り口に依らない参照。
 *
 * URL の params をそのまま操作へ渡すと、API から呼ぶときに
 * 「SvelteKit の params を組み立てる」という妙な仕事が要る。
 * `@username/slug` は URL の都合ではなく年表そのものの名前なので、
 * これを参照の形にする。
 *
 * **`actions/` の戻り値にもこれを使う。** 書き込んだあとに「次はどこを指せば
 * よいか」を返すのは、引数で「どこを指しているか」を受けるのと同じことなので、
 * 型を分ける理由がない。ルートはこれを見てリダイレクト先を組む。
 */
export type UserRef = { username: string };
export type TimelineRef = UserRef & { slug: string };

/**
 * id は URL から来ると文字列、JSON から来ると数値。どちらも受ける。
 *
 * **受け取るときだけの型**。返すものは `toId` を通した `number` にする。
 * 出ていく値まで曖昧なままにすると、受け手がもう一度整えることになる。
 */
export type Id = string | number;

export type EntryRef = TimelineRef & { entryId: Id };

/**
 * URL の params を `EntryRef` にする。
 *
 * `entryId` が `params.id` なのは URL 側の都合で、操作にとっては「どの行か」
 * でしかない。この詰め替えを各ルートに散らすと、1 か所で綴りを間違えても
 * 気づけない。画面と API の両方がここを通る。
 */
export const entryRef = (params: { username: string; slug: string; id: string }): EntryRef => ({
  username: params.username,
  slug: params.slug,
  entryId: params.id,
});

/** 引き当てた年表と、それを見ている人の立場。 */
export type ResolvedTimeline = {
  owner: UserRow;
  timeline: TimelineWithOwner;
  /** 見ている人が持ち主か。読むだけのページで「編集」を出すかの判断に使う */
  canEdit: boolean;
};

/** 持ち主だと確かめられた状態。`user` が null でないことが型で分かる。 */
export type OwnedTimeline = ResolvedTimeline & { user: SessionUser };

export function requireUser(ctx: AppContext): SessionUser {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}

/**
 * 数値 id に直す。
 *
 * `unknown` を受けるのは、検証前の入力（フォームの値、JSON のフィールド）を
 * そのまま渡せるようにするため。おかしな値は「無い」として扱う。
 * 形式が変な id と、消えてしまった id を、呼ぶ側が区別する意味はない。
 */
export function toId(value: unknown, message: string): number {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(id)) throw notFound(message);
  return id;
}

/* ── users ────────────────────────────────────────────────────────────── */

export async function resolveUser(ctx: AppContext, username: string): Promise<UserRow> {
  const owner = await sql.findUserByUsername(ctx.db, username);
  if (!owner) throw notFound(`@${username} は見つかりません`, "user_not_found");
  return owner;
}

/** 自分のページに書き込む操作用。年表を作るときなど。 */
export async function requireOwnUser(
  ctx: AppContext,
  username: string,
): Promise<{ user: SessionUser; owner: UserRow }> {
  const owner = await resolveUser(ctx, username);
  const user = requireUser(ctx);
  if (user.id !== owner.id) throw forbidden("他人のタイムラインは編集できません", "not_owner");
  return { user, owner };
}

/* ── timelines ────────────────────────────────────────────────────────── */

/** 読むだけ。年表は全部公開なので、誰でも通る。 */
export async function resolveTimeline(
  ctx: AppContext,
  ref: TimelineRef,
): Promise<ResolvedTimeline> {
  const owner = await resolveUser(ctx, ref.username);

  const timeline = await sql.findTimeline(ctx.db, owner.id, ref.slug);
  if (!timeline) {
    throw notFound(`@${ref.username}/${ref.slug} は見つかりません`, "timeline_not_found");
  }

  return { owner, timeline, canEdit: ctx.user?.id === owner.id };
}

/**
 * 書き込む操作用。
 *
 * ログインしていなければ `unauthenticated`、他人のものなら `forbidden`。
 * 画面ではログインへ送り、API では 401 を返す。その分かれ道は route.ts。
 */
export async function requireOwnTimeline(
  ctx: AppContext,
  ref: TimelineRef,
): Promise<OwnedTimeline> {
  const resolved = await resolveTimeline(ctx, ref);
  const user = requireUser(ctx);
  if (user.id !== resolved.owner.id) {
    throw forbidden("他人のタイムラインは編集できません", "not_owner");
  }
  return { ...resolved, user };
}

/* ── entries ──────────────────────────────────────────────────────────── */

const ENTRY_NOT_FOUND = "その行は見つかりません";

/** その年表に属する行。**別の年表の行は引けない**。id を直に叩かれても同じ。 */
export async function resolveEntry(
  ctx: AppContext,
  timelineId: number,
  entryId: Id,
  message = ENTRY_NOT_FOUND,
): Promise<TimelineEntry> {
  const entry = await sql.findEntry(ctx.db, timelineId, toId(entryId, message));
  if (!entry) throw notFound(message, "entry_not_found");
  return entry;
}

/** 行を編集する操作の入口。年表を引いて、持ち主か見て、行を引く。 */
export async function requireOwnEntry(
  ctx: AppContext,
  ref: EntryRef,
  message = ENTRY_NOT_FOUND,
): Promise<OwnedTimeline & { entry: TimelineEntry }> {
  const owned = await requireOwnTimeline(ctx, ref);
  const entry = await resolveEntry(ctx, owned.timeline.id, ref.entryId, message);
  return { ...owned, entry };
}

/**
 * ログインした人が、**誰の**年表の行でも引ける経路。「載せる」の入口。
 *
 * 年表は全部公開で読めるので、元が他人のものでも構わない。要るのは
 * 「自分の年表を持っている人であること」だけ（docs/003-events-and-notes.md）。
 */
export async function requireSignedInEntry(
  ctx: AppContext,
  ref: EntryRef,
): Promise<ResolvedTimeline & { user: SessionUser; entry: TimelineEntry }> {
  const user = requireUser(ctx);
  const resolved = await resolveTimeline(ctx, ref);
  const entry = await resolveEntry(ctx, resolved.timeline.id, ref.entryId);
  return { ...resolved, user, entry };
}

/**
 * 束ねる 2 行を引く。
 *
 * どちらもこの年表のものでなければならない。entry は年表のもので、跨いで
 * 束ねると「どちらの年表の行なのか」が決まらなくなる（docs/003 の 3 章）。
 * `resolveEntry` が年表で絞っているので、これは型の上でも守られる。
 *
 * 束ねた結果の出来事がすべて収まる期間が 1 つあることも、ここで見る。
 * 束ねた行は年表の 1 か所に出るので、そこに収まらない期間の出来事が混ざると
 * 行の位置が嘘になる（docs/003 の 4 章）。画面では候補を絞っているが、
 * **絞り込みは検査ではない**。
 */
export async function requireMergeablePair(
  ctx: AppContext,
  ref: EntryRef,
  withId: unknown,
): Promise<OwnedTimeline & { target: TimelineEntry; source: TimelineEntry }> {
  const owned = await requireOwnTimeline(ctx, ref);

  const targetId = toId(ref.entryId, ENTRY_NOT_FOUND);
  const sourceId = toId(withId, "束ねる相手が指定されていません");
  if (targetId === sourceId) throw invalid("同じ行同士は束ねられません", "same_entry");

  const target = await resolveEntry(ctx, owned.timeline.id, targetId);
  const source = await resolveEntry(ctx, owned.timeline.id, sourceId);

  if (!bundleable([...target.events, ...source.events])) {
    throw invalid("この 2 行は期間が離れていて束ねられません", "not_bundleable");
  }

  return { ...owned, target, source };
}
