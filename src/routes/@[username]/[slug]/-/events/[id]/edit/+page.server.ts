import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { deleteEvent, findEvent, listUsedCategories, updateEvent } from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import { formatLinksInput, parseEventForm } from "$lib/server/forms";
import type { MaybePlatform } from "$lib/server/platform";

/** URL の :id から、そのタイムラインに属するイベントを引く。 */
async function loadEvent(
  platform: MaybePlatform,
  params: { username: string; slug: string; id: string },
  user: App.Locals["user"],
  pathname: string,
) {
  const context = await loadTimelineContext(platform, params, user);
  requireOwner(user, context.owner.id, pathname);

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "そのイベントは見つかりません");

  const event = await findEvent(context.db, context.timeline.id, id);
  if (!event) throw error(404, "そのイベントは見つかりません");

  return { ...context, event };
}

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { db, owner, timeline, event } = await loadEvent(platform, params, locals.user, url.pathname);

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    event: {
      id: event.id,
      year: event.year,
      title: event.title,
      description: event.description,
      category: event.category,
      subcategory: event.subcategory,
      links: formatLinksInput(event.links),
    },
    used: await listUsedCategories(db, timeline.id),
  };
};

export const actions: Actions = {
  save: async ({ platform, params, locals, url, request }) => {
    const { db, owner, timeline, event } = await loadEvent(platform, params, locals.user, url.pathname);

    const form = await request.formData();
    const parsed = parseEventForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    await updateEvent(db, timeline.id, event.id, parsed.value);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },

  delete: async ({ platform, params, locals, url }) => {
    const { db, owner, timeline, event } = await loadEvent(platform, params, locals.user, url.pathname);

    await deleteEvent(db, timeline.id, event.id);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
