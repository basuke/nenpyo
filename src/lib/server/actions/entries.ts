/**
 * 年表の 1 行への操作。
 *
 * 「新しい行を作る」と「既にある束ねに足す」は入口が同じ（`into` の有無だけ）
 * なので、ここでも 1 つの操作にしてある。呼ぶ側に分岐を作ると、片方だけ
 * 通る道ができてしまう。
 */

import {
  requireOwnEntry,
  requireOwnTimeline,
  toId,
  type AppContext,
  type EntryRef,
  type TimelineRef,
} from "../context";
import { parseEntryInput, type RawInput } from "../input";
import * as sql from "../db";

const INTO_NOT_FOUND = "足す先の行が見つかりません";

export type AddedEntry = {
  entryId: number;
  /** 既にある束ねに足したのか、新しい行を作ったのか。戻り先の判断に使う */
  bundled: boolean;
};

/**
 * 行を足す。`into` に entry の id があれば、その束ねへイベントを 1 件足す。
 *
 * 束ねに足すときノートは要らない。ノートは行に付いているもので、
 * イベント側には無いため（docs/003-events-and-notes.md 3 章）。
 */
export async function addEntry(
  ctx: AppContext,
  ref: TimelineRef,
  raw: RawInput,
): Promise<AddedEntry> {
  const into = raw.into ?? "";

  if (into === "") {
    // 認可が先。通らない人に入力の良し悪しを教える必要はない。
    const { user, timeline } = await requireOwnTimeline(ctx, ref);
    // 事実とノートを 1 組で受け、event / note / entry に分けて置く。
    const entryId = await sql.createEntry(ctx.db, timeline.id, user.id, parseEntryInput(raw));
    return { entryId, bundled: false };
  }

  const entryId = toId(into, INTO_NOT_FOUND);
  const { user, timeline, entry } = await requireOwnEntry(ctx, { ...ref, entryId }, INTO_NOT_FOUND);

  await sql.addEventToEntry(ctx.db, timeline.id, entry, user.id, parseEntryInput(raw));
  return { entryId: entry.id, bundled: true };
}

/** 代表イベントとノートを書き換える。凍結されたノートの複製は sql 側で起きる。 */
export async function updateEntry(ctx: AppContext, ref: EntryRef, raw: RawInput) {
  const { user, owner, timeline, entry } = await requireOwnEntry(ctx, ref);
  const input = parseEntryInput(raw);

  await sql.updateEntry(ctx.db, timeline.id, entry, input, user.id);

  return { username: owner.username, slug: timeline.slug };
}

export async function deleteEntry(ctx: AppContext, ref: EntryRef) {
  const { owner, timeline, entry } = await requireOwnEntry(ctx, ref);

  await sql.deleteEntry(ctx.db, timeline.id, entry);

  return { username: owner.username, slug: timeline.slug };
}
