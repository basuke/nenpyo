/**
 * 行を編集する画面が要るもの。
 *
 * 束ねの候補や載せ先の候補のように、**画面に出す前に絞り込みが要るもの**が
 * ここに来る。絞り込みは親切であって検査ではないので、同じ規則を
 * `actions/` 側でもう一度通す（docs/004-layers.md）。
 */

import {
  requireMergeablePair,
  requireOwnEntry,
  requireOwnTimeline,
  requireSignedInEntry,
  resolveEntry,
} from "../context";
import { formatLinksInput } from "../input";
import { bundleable } from "$lib/period";
import * as sql from "../db";
import type { AppContext, EntryRef, Id, TimelineRef } from "../context";
import type { TimelineEntry } from "../db";

/**
 * イベントを足すフォーム。`into` が付いていたら、新しい行ではなく
 * 既にある束ねに足す画面になる。
 */
export async function newEntryView(ctx: AppContext, ref: TimelineRef, into: Id | null) {
  const { owner, timeline } = await requireOwnTimeline(ctx, ref);

  const entry =
    into === null || into === ""
      ? null
      : await resolveEntry(ctx, timeline.id, into, "足す先の行が見つかりません");

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    into: entry && {
      id: entry.id,
      titles: entry.events.map((event) => event.title),
      year: entry.events[0]?.year,
    },
    used: await sql.listUsedCategories(ctx.db, timeline.id),
  };
}

/** 行を編集するフォームと、束ねの中身と、束ねる相手の候補。 */
export async function editEntryView(ctx: AppContext, ref: EntryRef) {
  const { owner, timeline, entry } = await requireOwnEntry(ctx, ref, "そのイベントは見つかりません");

  // 編集できるのは代表イベント（position 0）。残りは一覧として見せて、
  // 並べ替えと切り離しだけできるようにする。
  const [head] = entry.events;

  // 束ねる相手の候補。同じ年表であることと、束ねた結果が 1 つの期間に収まること。
  // 「同じ年」ではないのは、1998 年と 1998 年 3 月は束ねられるが 1998 年 3 月と
  // 5 月は束ねられない、という差があるため（$lib/period）。
  const siblings = (await sql.listEntries(ctx.db, timeline.id))
    .filter((other) => other.id !== entry.id && bundleable([...entry.events, ...other.events]))
    .map((other) => ({
      id: other.id,
      label: other.events.map((event) => event.title).join(" / "),
    }));

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    entry: {
      id: entry.id,
      year: head?.year,
      title: head?.title,
      tagline: entry.note?.tagline ?? null,
      body: entry.note?.body ?? null,
      category: head?.category ?? null,
      subcategory: head?.subcategory ?? null,
      links: formatLinksInput(head?.links ?? null),
      events: entry.events.map((event) => ({ id: event.id, title: event.title })),
    },
    siblings,
    used: await sql.listUsedCategories(ctx.db, timeline.id),
  };
}

/** 束ねる 2 行を並べて、どちらのノートを採るか選ばせる。 */
export async function mergeView(ctx: AppContext, ref: EntryRef, withId: unknown) {
  const { owner, timeline, target, source } = await requireMergeablePair(ctx, ref, withId);

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    target: noteChoice(target),
    source: noteChoice(source),
  };
}

function noteChoice(entry: TimelineEntry) {
  return {
    id: entry.id,
    titles: entry.events.map((event) => event.title),
    noteId: entry.note?.id ?? null,
    tagline: entry.note?.tagline ?? null,
    body: entry.note?.body ?? null,
  };
}

/** 他人の年表の行を、自分のどの年表に載せるか選ぶ画面。 */
export async function placeView(ctx: AppContext, ref: EntryRef) {
  const { user, owner, timeline, entry: source } = await requireSignedInEntry(ctx, ref);
  const eventIds = source.events.map((event) => event.id);

  // ノートの持ち主は、本文を開いたときだけ名前を出す。表示名が無ければ username。
  const author = source.note && source.author;

  return {
    from: { username: owner.username, slug: timeline.slug, title: timeline.title },
    source: {
      id: source.id,
      titles: source.events.map((event) => event.title),
      year: source.events[0]?.year,
      tagline: source.note?.tagline ?? null,
      body: source.note?.body ?? null,
      author: author ? author.display_name ?? author.username : null,
      hasNote: Boolean(source.note),
    },
    targets: await listPlaceTargets(ctx, user.id, timeline.id, eventIds),
  };
}

/**
 * 載せ先の候補を、載せられない理由ごと返す。
 *
 * 既に同じ出来事を持っている年表を黙って隠すと「なぜ出てこないのか」が
 * 分からないので、出したうえで塞ぐ。
 */
async function listPlaceTargets(
  ctx: AppContext,
  userId: number,
  exclude: number,
  eventIds: number[],
) {
  const targets = [];
  for (const candidate of await sql.listTimelinesByOwner(ctx.db, userId)) {
    if (candidate.id === exclude) continue;
    const already = await sql.eventsAlreadyIn(ctx.db, candidate.id, eventIds);
    targets.push({
      id: candidate.id,
      title: candidate.title,
      slug: candidate.slug,
      taken: already.length,
    });
  }
  return targets;
}
