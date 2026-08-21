import type { PageServerLoad } from "./$types";
import { listEntries } from "$lib/server/db";
import { loadTimelineContext } from "$lib/server/guards";

// 読むだけのページなので、クライアント側では何もしない。
// 有効にしておくと 720 件分のデータがハイドレーション用の JSON として
// 本文と二重に載り、転送量がそのまま倍になる。
export const csr = false;

export const load: PageServerLoad = async ({ platform, params, locals }) => {
  const { db, owner, timeline, canEdit } = await loadTimelineContext(platform, params, locals.user);

  const entries = await listEntries(db, timeline.id);

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
  };
};
