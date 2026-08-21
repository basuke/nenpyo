import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  deleteEntry,
  detachEvent,
  findEntry,
  listEntries,
  listUsedCategories,
  reorderEntryEvents,
  updateEntry,
} from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import { formatLinksInput, parseEntryForm } from "$lib/server/forms";
import type { MaybePlatform } from "$lib/server/platform";

/** URL の :id から、そのタイムラインに属する行を引く。 */
async function loadEntry(
  platform: MaybePlatform,
  params: { username: string; slug: string; id: string },
  user: App.Locals["user"],
  pathname: string,
) {
  const context = await loadTimelineContext(platform, params, user);
  requireOwner(user, context.owner.id, pathname);

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "そのイベントは見つかりません");

  const entry = await findEntry(context.db, context.timeline.id, id);
  if (!entry) throw error(404, "そのイベントは見つかりません");

  return { ...context, entry };
}

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { db, owner, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

  // 編集できるのは代表イベント（position 0）。残りは一覧として見せて、
  // 並べ替えと切り離しだけできるようにする。
  const [head] = entry.events;

  // 束ねる相手の候補。entry は年表のものなので、跨ぐと意味が壊れる。
  // 同じ年に限るのは、実データの束ねが 27 件すべて同年だから。
  const siblings = (await listEntries(db, timeline.id))
    .filter((other) => other.id !== entry.id && other.events[0]?.year === head?.year)
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
    used: await listUsedCategories(db, timeline.id),
  };
};

export const actions: Actions = {
  save: async ({ platform, params, locals, url, request }) => {
    const { db, owner, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

    const form = await request.formData();
    const parsed = parseEntryForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    await updateEntry(db, timeline.id, entry, parsed.value);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },

  /** 束ねからイベントを 1 件外して、独立した行にする。ノートは共有したままになる。 */
  detach: async ({ platform, params, locals, url, request }) => {
    const { db, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

    const eventId = Number((await request.formData()).get("eventId"));
    if (!Number.isInteger(eventId)) return fail(400, { message: "イベントが指定されていません" });
    if (entry.events.length < 2) return fail(400, { message: "束ねられていない行は切り離せません" });

    await detachEvent(db, timeline.id, entry, eventId);

    // 切り離した直後は両方が同じノートを指している。元の行に留まって直せるようにする。
    return { detached: true };
  },

  /** 束ねの中の並びを 1 つ動かす。先頭が年表上の位置を決める。 */
  reorder: async ({ platform, params, locals, url, request }) => {
    const { db, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

    const form = await request.formData();
    const eventId = Number(form.get("eventId"));
    const delta = form.get("direction") === "up" ? -1 : 1;

    const ids = entry.events.map((event) => event.id);
    const from = ids.indexOf(eventId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return fail(400, { message: "そこへは動かせません" });

    ids.splice(to, 0, ...ids.splice(from, 1));
    await reorderEntryEvents(db, timeline.id, entry, ids);

    return { reordered: true };
  },

  delete: async ({ platform, params, locals, url }) => {
    const { db, owner, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

    await deleteEntry(db, timeline.id, entry);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
