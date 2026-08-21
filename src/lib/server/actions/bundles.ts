/**
 * 束ねの組み替え。統合・切り離し・並べ替え。
 *
 * 束ねられるかどうかは期間で決まる（docs/003-events-and-notes.md 4 章）。
 * 画面では候補を絞っているが、**そこは絞り込みであって検査ではない**ので、
 * 実際に束ねるときに必ずもう一度見る。
 */

import { invalid } from "../errors";
import {
  requireMergeablePair,
  requireOwnEntry,
  toId,
  type AppContext,
  type EntryRef,
} from "../context";
import { parseMergeChoice, type RawInput } from "../input";
import * as sql from "../db";

/** 2 つの行を 1 つに束ね、どちらのノートを採るかを決める。 */
export async function mergeEntries(ctx: AppContext, ref: EntryRef, raw: RawInput) {
  const pair = await requireMergeablePair(ctx, ref, raw.with);
  const { user, owner, timeline, target, source } = pair;

  const choice = parseMergeChoice(raw, {
    target: target.note?.id ?? null,
    source: source.note?.id ?? null,
  });

  await sql.mergeEntries(ctx.db, timeline.id, target, source, choice, user.id);

  return { username: owner.username, slug: timeline.slug };
}

/**
 * 束ねからイベントを 1 件外して、独立した行にする。
 *
 * ノートは共有したまま残る。片方を直したときにもう片方が動かないよう、
 * 複製は書き込み側で起きる（docs/003 の 5 章）。
 */
export async function detachEvent(ctx: AppContext, ref: EntryRef, raw: RawInput) {
  const { timeline, entry } = await requireOwnEntry(ctx, ref);

  const eventId = toId(raw.eventId, "イベントが指定されていません");
  if (entry.events.length < 2) throw invalid("束ねられていない行は切り離せません", "not_bundled");
  if (!entry.events.some((event) => event.id === eventId)) {
    throw invalid("その行にないイベントは切り離せません", "event_not_in_entry");
  }

  await sql.detachEvent(ctx.db, timeline.id, entry, eventId);
}

/**
 * 束ねの中の並びを 1 つ動かす。
 *
 * 日付順に寄せないのは、同じ年の出来事をどの順に読ませるかが書き手の判断
 * だから。先頭のイベントが年表上の位置を決める。
 */
export async function reorderEvents(ctx: AppContext, ref: EntryRef, raw: RawInput) {
  const { timeline, entry } = await requireOwnEntry(ctx, ref);

  const eventId = toId(raw.eventId, "イベントが指定されていません");
  const delta = raw.direction === "up" ? -1 : 1;

  const ids = entry.events.map((event) => event.id);
  const from = ids.indexOf(eventId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) throw invalid("そこへは動かせません", "cannot_move");

  ids.splice(to, 0, ...ids.splice(from, 1));
  await sql.reorderEntryEvents(ctx.db, timeline.id, entry, ids);
}
