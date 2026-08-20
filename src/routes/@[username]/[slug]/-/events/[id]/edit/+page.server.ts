import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { deleteEntry, findEntry, listUsedCategories, updateEntry } from "$lib/server/db";
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

  // 束ねられた行は代表イベントだけを編集できる。束ねの編集は Issue #9 で扱う。
  const head = entry.events[0];

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
      eventCount: entry.events.length,
    },
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

  delete: async ({ platform, params, locals, url }) => {
    const { db, owner, timeline, entry } = await loadEntry(platform, params, locals.user, url.pathname);

    await deleteEntry(db, timeline.id, entry);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
