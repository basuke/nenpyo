import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createTimeline } from "$lib/server/db";
import { requireOwnUser } from "$lib/server/guards";
import { parseTimelineForm } from "$lib/server/forms";

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  await requireOwnUser(platform, params.username, locals.user, url.pathname);
  return { username: params.username };
};

export const actions: Actions = {
  default: async ({ platform, params, locals, url, request }) => {
    const { db, owner } = await requireOwnUser(platform, params.username, locals.user, url.pathname);

    const form = await request.formData();
    const parsed = parseTimelineForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    try {
      await createTimeline(db, { ownerId: owner.id, ...parsed.value });
    } catch (cause) {
      // slug は同一オーナー内で一意。ぶつかったら理由を見せて戻す。
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
};
