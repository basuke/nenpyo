import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { deleteTimeline, updateTimeline } from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import { parseTimelineForm } from "$lib/server/forms";

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { owner, timeline } = await loadTimelineContext(platform, params, locals.user);
  requireOwner(locals.user, owner.id, url.pathname);

  return {
    username: owner.username,
    timeline: {
      slug: timeline.slug,
      title: timeline.title,
      description: timeline.description,
      eventCount: timeline.event_count,
    },
  };
};

export const actions: Actions = {
  save: async ({ platform, params, locals, url, request }) => {
    const { db, owner, timeline } = await loadTimelineContext(platform, params, locals.user);
    requireOwner(locals.user, owner.id, url.pathname);

    const form = await request.formData();
    const parsed = parseTimelineForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    try {
      await updateTimeline(db, timeline.id, parsed.value);
    } catch (cause) {
      if (String(cause).includes("UNIQUE")) {
        return fail(409, {
          message: `slug「${parsed.value.slug}」は既に使われています`,
          values: Object.fromEntries(form),
        });
      }
      throw cause;
    }

    throw redirect(303, `/@${owner.username}/${parsed.value.slug}`);
  },

  delete: async ({ platform, params, locals, url }) => {
    const { db, owner, timeline } = await loadTimelineContext(platform, params, locals.user);
    requireOwner(locals.user, owner.id, url.pathname);

    // 物理削除。イベントは ON DELETE CASCADE で一緒に消える。
    await deleteTimeline(db, timeline.id);

    throw redirect(303, `/@${owner.username}`);
  },
};
