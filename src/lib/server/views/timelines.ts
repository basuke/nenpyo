/**
 * 読み取り。**画面に渡す形まで組んで返す**。
 *
 * DB の行をそのままクライアントへ渡さず、そのページに必要な分だけ選んで
 * camelCase に詰め替える（CLAUDE.md 4 章）。詰め替えがルートに散っていると、
 * 同じものを API から返したいときに書き直しになるので、ここに集める。
 *
 * **戻り値には必ず名前を付ける。** ここで返す形はそのままページが受け取る
 * `data` であり、API を足したときのレスポンスの契約でもある。無名のままだと
 * 他所から指せないし、うっかり形が変わっても誰も気づかない。
 *
 * `actions/` と同じく SvelteKit を知らない。失敗は `AppError`。
 */

import {
  requireOwnTimeline,
  requireOwnUser,
  resolveTimeline,
  resolveUser,
  type AppContext,
  type TimelineRef,
} from "../context";
import { parseLinks, type ParsedLink } from "$lib/links";
import {
  toPersonView,
  toTimelineCard,
  type OwnerView,
  type PersonView,
  type TimelineCard,
} from "./common";
import * as sql from "../db";
import type { TimelineEntry } from "../db";

export type HomeView = { timelines: TimelineCard[] };

/** トップ。更新の新しい順に並べた全部の年表。 */
export async function homeView(ctx: AppContext): Promise<HomeView> {
  return { timelines: (await sql.listAllTimelines(ctx.db)).map(toTimelineCard) };
}

export type UserView = {
  owner: OwnerView & { avatarUrl: string | null };
  timelines: TimelineCard[];
  canEdit: boolean;
};

/** `/@username`。その人の年表の一覧。 */
export async function userView(ctx: AppContext, username: string): Promise<UserView> {
  const owner = await resolveUser(ctx, username);

  return {
    owner: {
      username: owner.username,
      displayName: owner.display_name,
      avatarUrl: owner.avatar_url,
    },
    timelines: (await sql.listTimelinesByOwner(ctx.db, owner.id)).map(toTimelineCard),
    canEdit: ctx.user?.id === owner.id,
  };
}

/**
 * 1 行ぶんのリンク。出どころが 2 つある。
 *
 * 出来事そのものの出典（`events.links`）と、そのノートの根拠（`notes.links`）は
 * 別物なので、まとめずに分けて出す（docs/003-events-and-notes.md 2 章）。
 */
export type EntryLinks = { sources: ParsedLink[]; references: ParsedLink[] };

/** 束ねが指しているイベント 1 件。年表に出す分だけ。 */
export type EventView = {
  id: number;
  title: string;
  category: string | null;
  subcategory: string | null;
};

/**
 * 年表に並べる 1 行。
 *
 * `events` が 1..N なのは束ねを同じ仕組みで表すため。単独のイベントは
 * 要素数 1 の束ねとして扱うので、この型に分岐は要らない
 * （docs/003-events-and-notes.md）。
 */
export type EntryView = {
  id: number;
  /** ノート。付いていない行もある */
  note: { id: number; tagline: string | null; body: string | null } | null;
  /** ノートの持ち主。本文を開いたときだけ出す（#25） */
  author: PersonView | null;
  /** 先祖のノートを書いた人。新しい順、重複を除いて最大 3 人 */
  ancestors: PersonView[];
  events: EventView[];
  links: EntryLinks;
};

/** 同じ年の行をまとめたかたまり。年表はこれを縦に並べたもの。 */
export type YearGroup = { year: number; entries: EntryView[] };

export type TimelineView = {
  owner: OwnerView;
  timeline: { slug: string; title: string; description: string | null; updatedAt: string };
  years: YearGroup[];
  entryCount: number;
  canEdit: boolean;
  canPlace: boolean;
};

function toEntryView(entry: TimelineEntry): EntryView {
  return {
    id: entry.id,
    note: entry.note && { id: entry.note.id, tagline: entry.note.tagline, body: entry.note.body },
    author: entry.author && toPersonView(entry.author),
    ancestors: entry.ancestors.map(toPersonView),
    events: entry.events.map((event) => ({
      id: event.id,
      title: event.title,
      category: event.category,
      subcategory: event.subcategory,
    })),
    links: {
      sources: entry.events.flatMap((event) => parseLinks(event.links)),
      references: parseLinks(entry.note?.links ?? null),
    },
  };
}

/** 年表そのもの。年ごとにまとめた行が本体。 */
export async function timelineView(ctx: AppContext, ref: TimelineRef): Promise<TimelineView> {
  const { owner, timeline, canEdit } = await resolveTimeline(ctx, ref);

  // 年は代表イベント（position 0）が持っている。EntryView には日付を載せない
  // ので、まとめ終わるまで年を横に持っておく。
  const entries = (await sql.listEntries(ctx.db, timeline.id)).map((entry) => ({
    year: entry.events[0]?.year,
    view: toEntryView(entry),
  }));

  // 年ごとにまとめる。entries は既に代表イベントの年で昇順なので、
  // 隣り合うものを畳むだけでよい。
  const years: YearGroup[] = [];
  for (const { year, view } of entries) {
    if (year === undefined) continue;
    const last = years.at(-1);
    if (last?.year === year) last.entries.push(view);
    else years.push({ year, entries: [view] });
  }

  return {
    owner: { username: owner.username, displayName: owner.display_name },
    timeline: {
      slug: timeline.slug,
      title: timeline.title,
      description: timeline.description,
      updatedAt: timeline.updated_at,
    },
    years,
    entryCount: entries.length,
    canEdit,
    // ログインしていれば、他人の年表からでも自分の年表へ載せられる。
    // どの年表に入れられるかは載せる画面で見る。
    canPlace: Boolean(ctx.user),
  };
}

export type NewTimelineView = { username: string };

/** 年表を作るフォーム。自分のページでなければ通さない。 */
export async function newTimelineView(
  ctx: AppContext,
  username: string,
): Promise<NewTimelineView> {
  const { owner } = await requireOwnUser(ctx, username);
  return { username: owner.username };
}

export type TimelineEditView = {
  username: string;
  timeline: {
    slug: string;
    title: string;
    description: string | null;
    /** 消すときに「何件まとめて消えるか」を見せるために要る */
    entryCount: number;
  };
};

/** 年表を編集するフォーム。 */
export async function timelineEditView(
  ctx: AppContext,
  ref: TimelineRef,
): Promise<TimelineEditView> {
  const { owner, timeline } = await requireOwnTimeline(ctx, ref);

  return {
    username: owner.username,
    timeline: {
      slug: timeline.slug,
      title: timeline.title,
      description: timeline.description,
      entryCount: timeline.entry_count,
    },
  };
}
