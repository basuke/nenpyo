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
import type { CategoryUsage, TimelineEntry } from "../db";
import type { TimelineLabel, TimelineOrigin } from "./common";

/** 束ねを 1 行で示すときの形。中身のイベント名を並べて見せる。 */
export type BundleSummary = { id: number; titles: string[]; year: number | undefined };

/**
 * イベントを足すフォーム。`into` が付いていたら、新しい行ではなく
 * 既にある束ねに足す画面になる。
 */
export type NewEntryView = {
  username: string;
  timeline: TimelineLabel;
  /** 足す先の束ね。新しい行を作るときは null */
  into: BundleSummary | null;
  used: CategoryUsage[];
};

export async function newEntryView(
  ctx: AppContext,
  ref: TimelineRef,
  into: Id | null,
): Promise<NewEntryView> {
  const { owner, timeline } = await requireOwnTimeline(ctx, ref);

  const entry =
    into === null || into === ""
      ? null
      : await resolveEntry(ctx, timeline.id, into, "足す先の行が見つかりません");

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    into: entry && summarize(entry),
    used: await sql.listUsedCategories(ctx.db, timeline.id),
  };
}

function summarize(entry: TimelineEntry): BundleSummary {
  return {
    id: entry.id,
    titles: entry.events.map((event) => event.title),
    year: entry.events[0]?.year,
  };
}

/**
 * 編集フォームに詰める値。
 *
 * `EntryFields.svelte` がそのまま欄に流し込む。`links` が文字列なのは、
 * 1 行 1 本のテキストエリアで受けているため（input.ts の `formatLinksInput`）。
 */
export type EntryFormValues = {
  id: number;
  year: number | undefined;
  title: string | undefined;
  tagline: string | null;
  body: string | null;
  category: string | null;
  subcategory: string | null;
  links: string;
  /** 束ねが指しているイベント。並べ替えと切り離しの対象 */
  events: { id: number; title: string }[];
};

/** 束ねる相手の候補。`label` はイベント名を並べたもの。 */
export type BundleCandidate = { id: number; label: string };

export type EditEntryView = {
  username: string;
  timeline: TimelineLabel;
  entry: EntryFormValues;
  siblings: BundleCandidate[];
  used: CategoryUsage[];
};

/** 行を編集するフォームと、束ねの中身と、束ねる相手の候補。 */
export async function editEntryView(ctx: AppContext, ref: EntryRef): Promise<EditEntryView> {
  const { owner, timeline, entry } = await requireOwnEntry(ctx, ref, "そのイベントは見つかりません");

  // 編集できるのは代表イベント（position 0）。残りは一覧として見せて、
  // 並べ替えと切り離しだけできるようにする。
  const [head] = entry.events;

  // 束ねる相手の候補。同じ年表であることと、束ねた結果が 1 つの期間に収まること。
  // 「同じ年」ではないのは、1998 年と 1998 年 3 月は束ねられるが 1998 年 3 月と
  // 5 月は束ねられない、という差があるため（$lib/period）。
  const siblings: BundleCandidate[] = (await sql.listEntries(ctx.db, timeline.id))
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

/**
 * 束ねるときに並べる 1 行。
 *
 * `noteId` が要るのは、どちらのノートを採るかを選ばせるため。
 * ノートが無い行もあるので null を許す。
 */
export type MergeCandidate = BundleSummary & {
  noteId: number | null;
  tagline: string | null;
  body: string | null;
};

export type MergeView = {
  username: string;
  timeline: TimelineLabel;
  target: MergeCandidate;
  source: MergeCandidate;
};

/** 束ねる 2 行を並べて、どちらのノートを採るか選ばせる。 */
export async function mergeView(
  ctx: AppContext,
  ref: EntryRef,
  withId: unknown,
): Promise<MergeView> {
  const { owner, timeline, target, source } = await requireMergeablePair(ctx, ref, withId);

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    target: noteChoice(target),
    source: noteChoice(source),
  };
}

function noteChoice(entry: TimelineEntry): MergeCandidate {
  return {
    ...summarize(entry),
    noteId: entry.note?.id ?? null,
    tagline: entry.note?.tagline ?? null,
    body: entry.note?.body ?? null,
  };
}

/** 載せる元の行。誰の持ち物のノートなのかまで見せる。 */
export type PlaceSource = BundleSummary & {
  tagline: string | null;
  body: string | null;
  /** ノートの持ち主の表示名。ノートが無ければ null */
  author: string | null;
  hasNote: boolean;
};

/**
 * 載せ先の候補。
 *
 * `taken` は「その年表に既にある出来事の数」。0 でなければ載せられないが、
 * 候補からは消さない（下の `listPlaceTargets` を見よ）。
 */
export type PlaceTarget = { id: number; title: string; slug: string; taken: number };

export type PlaceView = {
  /** どの年表から持ってくるのか */
  from: TimelineOrigin;
  source: PlaceSource;
  targets: PlaceTarget[];
};

/** 他人の年表の行を、自分のどの年表に載せるか選ぶ画面。 */
export async function placeView(ctx: AppContext, ref: EntryRef): Promise<PlaceView> {
  const { user, owner, timeline, entry: source } = await requireSignedInEntry(ctx, ref);
  const eventIds = source.events.map((event) => event.id);

  // ノートの持ち主は、本文を開いたときだけ名前を出す。表示名が無ければ username。
  const author = source.note && source.author;

  return {
    from: { username: owner.username, slug: timeline.slug, title: timeline.title },
    source: {
      ...summarize(source),
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
): Promise<PlaceTarget[]> {
  const targets: PlaceTarget[] = [];
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
