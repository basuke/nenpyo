/**
 * 年表そのものへの操作。
 *
 * ここに来る前に認可も検証も済んでいる、ということはない。**この中で済ませる**。
 * 画面から呼んでも API から呼んでも同じ判断を通したいので、手前で分かれる余地を
 * 残さない（docs/004-layers.md）。
 */

import { conflict } from "../errors";
import { requireOwnTimeline, requireOwnUser, type AppContext, type TimelineRef } from "../context";
import { parseTimelineInput, type RawInput } from "../input";
import * as sql from "../db";

/**
 * slug の重複を、DB のエラー文字列から拾い直す。
 *
 * 手前で SELECT して確かめても、その間に別のリクエストが入れば同じことになる。
 * 一意を守っているのは UNIQUE 制約なので、**判定もそこに任せて**、
 * 返す言葉だけをこちらで用意する。
 */
function rethrowSlugConflict(cause: unknown, slug: string): never {
  if (String(cause).includes("UNIQUE")) {
    throw conflict(`slug「${slug}」は既に使われています`, "slug_taken");
  }
  throw cause;
}

export async function createTimeline(ctx: AppContext, username: string, raw: RawInput) {
  const { owner } = await requireOwnUser(ctx, username);
  const input = parseTimelineInput(raw);

  try {
    await sql.createTimeline(ctx.db, { ownerId: owner.id, ...input });
  } catch (cause) {
    rethrowSlugConflict(cause, input.slug);
  }

  return { username: owner.username, slug: input.slug };
}

export async function updateTimeline(ctx: AppContext, ref: TimelineRef, raw: RawInput) {
  const { owner, timeline } = await requireOwnTimeline(ctx, ref);
  const input = parseTimelineInput(raw);

  try {
    await sql.updateTimeline(ctx.db, timeline.id, input);
  } catch (cause) {
    rethrowSlugConflict(cause, input.slug);
  }

  return { username: owner.username, slug: input.slug };
}

export async function deleteTimeline(ctx: AppContext, ref: TimelineRef) {
  const { owner, timeline } = await requireOwnTimeline(ctx, ref);

  // 物理削除。イベントは ON DELETE CASCADE で一緒に消える。
  await sql.deleteTimeline(ctx.db, timeline.id);

  return { username: owner.username };
}
