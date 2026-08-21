import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createEntry, listUsedCategories } from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import { parseEntryForm } from "$lib/server/forms";

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { db, owner, timeline } = await loadTimelineContext(platform, params, locals.user);
  requireOwner(locals.user, owner.id, url.pathname);

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    used: await listUsedCategories(db, timeline.id),
  };
};

export const actions: Actions = {
  default: async ({ platform, params, locals, url, request }) => {
    const { db, owner, timeline } = await loadTimelineContext(platform, params, locals.user);
    const user = requireOwner(locals.user, owner.id, url.pathname);

    const form = await request.formData();
    const parsed = parseEntryForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    // 事実と読みを 1 枚のフォームで受け、event / note / entry に分けて置く。
    await createEntry(db, timeline.id, user.id, parsed.value);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
