import type { PageServerLoad } from "./$types";
import { listEvents } from "$lib/server/db";
import { loadTimelineContext } from "$lib/server/guards";

export const load: PageServerLoad = async ({ platform, params, locals }) => {
  const { db, owner, timeline, canEdit } = await loadTimelineContext(platform, params, locals.user);

  const events = await listEvents(db, timeline.id);

  // 年ごとにまとめる。events は既に year 昇順なので、隣り合うものを畳むだけでよい。
  const years: { year: number; events: typeof events }[] = [];
  for (const event of events) {
    const last = years.at(-1);
    if (last?.year === event.year) last.events.push(event);
    else years.push({ year: event.year, events: [event] });
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
    eventCount: events.length,
    canEdit,
  };
};
