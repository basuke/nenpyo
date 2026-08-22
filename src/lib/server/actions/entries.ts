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
import { parseEntryInput, parseNoteInput, type RawInput } from "../input";
import * as sql from "../db";

const INTO_NOT_FOUND = "足す先の行が見つかりません";

/**
 * 足したあとの行。
 *
 * `entryId` が `number` なのは、これが出ていく値だから。受け取るときの
 * `Id`（文字列も数値も受ける）とは別（context.ts）。
 */
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
export async function updateEntry(
  ctx: AppContext,
  ref: EntryRef,
  raw: RawInput,
): Promise<TimelineRef> {
  const { user, owner, timeline, entry } = await requireOwnEntry(ctx, ref);
  const input = parseEntryInput(raw);

  await sql.updateEntry(ctx.db, timeline.id, entry, input, user.id);

  return { username: owner.username, slug: timeline.slug };
}

/**
 * ノートだけを書き換える。事実には触らない。
 *
 * MCP から AI が使う口（#34）。**見方には正誤が無いので、ここには捏造の
 * 危険がない。** 事実のほうは `addEntry` が持っていて、そちらは別の話。
 *
 * 中では `updateEntry` と同じ道を通る。事実の欄は今の値をそのまま渡すので、
 * 凍結されたノートの複製（docs/003 5 章）もそのまま効く。**書き込みの道を
 * 2 本にしない**ためで、片方だけ CoW を忘れる事故を防ぐ。
 */
export async function writeNote(
  ctx: AppContext,
  ref: EntryRef,
  raw: RawInput,
): Promise<TimelineRef> {
  const { user, owner, timeline, entry } = await requireOwnEntry(ctx, ref);

  const head = entry.events[0];
  if (!head) throw new Error(`entry ${entry.id} has no event`);

  await sql.updateEntry(
    ctx.db,
    timeline.id,
    entry,
    {
      // 事実は今のまま。ここで動かすのはノートだけ。
      year: head.year,
      title: head.title,
      category: head.category,
      subcategory: head.subcategory,
      links: head.links,
      ...parseNoteInput(raw),
    },
    user.id,
  );

  return { username: owner.username, slug: timeline.slug };
}

export async function deleteEntry(ctx: AppContext, ref: EntryRef): Promise<TimelineRef> {
  const { owner, timeline, entry } = await requireOwnEntry(ctx, ref);

  await sql.deleteEntry(ctx.db, timeline.id, entry);

  return { username: owner.username, slug: timeline.slug };
}
