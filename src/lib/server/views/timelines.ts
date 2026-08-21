/**
 * 読み取り。**画面に渡す形まで組んで返す**。
 *
 * DB の行をそのままクライアントへ渡さず、そのページに必要な分だけ選んで
 * camelCase に詰め替える（CLAUDE.md 4 章）。詰め替えがルートに散っていると、
 * 同じものを API から返したいときに書き直しになるので、ここに集める。
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
import { parseLinks } from "$lib/links";
import * as sql from "../db";
import type { TimelineEntry } from "../db";

/** トップ。更新の新しい順に並べた全部の年表。 */
export async function homeView(ctx: AppContext) {
  return { timelines: await sql.listAllTimelines(ctx.db) };
}

/** `/@username`。その人の年表の一覧。 */
export async function userView(ctx: AppContext, username: string) {
  const owner = await resolveUser(ctx, username);

  return {
    owner: {
      username: owner.username,
      displayName: owner.display_name,
      avatarUrl: owner.avatar_url,
    },
    timelines: await sql.listTimelinesByOwner(ctx.db, owner.id),
    canEdit: ctx.user?.id === owner.id,
  };
}

/**
 * リンクは出どころが 2 つある。出来事そのものの出典（events.links）と、
 * そのノートの根拠（notes.links）は別物なので、まとめずに分けて出す
 * （docs/003-events-and-notes.md 2 章）。
 */
function linksOf(entry: TimelineEntry) {
  return {
    sources: entry.events.flatMap((event) => parseLinks(event.links)),
    references: parseLinks(entry.note?.links ?? null),
  };
}

/** 年表そのもの。年ごとにまとめた行が本体。 */
export async function timelineView(ctx: AppContext, ref: TimelineRef) {
  const { owner, timeline, canEdit } = await resolveTimeline(ctx, ref);

  const entries = (await sql.listEntries(ctx.db, timeline.id)).map((entry) => ({
    ...entry,
    links: linksOf(entry),
  }));

  // 年ごとにまとめる。entries は既に代表イベントの年で昇順なので、
  // 隣り合うものを畳むだけでよい。
  const years: { year: number; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const year = entry.events[0]?.year;
    if (year === undefined) continue;
    const last = years.at(-1);
    if (last?.year === year) last.entries.push(entry);
    else years.push({ year, entries: [entry] });
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

/** 年表を作るフォーム。自分のページでなければ通さない。 */
export async function newTimelineView(ctx: AppContext, username: string) {
  const { owner } = await requireOwnUser(ctx, username);
  return { username: owner.username };
}

/** 年表を編集するフォーム。 */
export async function timelineEditView(ctx: AppContext, ref: TimelineRef) {
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
