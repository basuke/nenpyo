import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { addEventToEntry, createEntry, findEntry, listUsedCategories } from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import { parseEntryForm } from "$lib/server/forms";
import type { MaybePlatform } from "$lib/server/platform";

/**
 * `?into={entryId}` が付いていたら、新しい行ではなく既にある束ねに足す。
 *
 * ノートは entry のものなので、足すときには要らない。事実の欄だけを受ける。
 */
async function loadTarget(
  platform: MaybePlatform,
  params: { username: string; slug: string },
  into: string | null,
  user: App.Locals["user"],
  pathname: string,
) {
  const context = await loadTimelineContext(platform, params, user);
  const owner = requireOwner(user, context.owner.id, pathname);

  if (into === null) return { ...context, user: owner, entry: null };

  const id = Number(into);
  if (!Number.isInteger(id)) throw error(404, "足す先の行が見つかりません");

  const entry = await findEntry(context.db, context.timeline.id, id);
  if (!entry) throw error(404, "足す先の行が見つかりません");

  return { ...context, user: owner, entry };
}

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { db, owner, timeline, entry } = await loadTarget(
    platform,
    params,
    url.searchParams.get("into"),
    locals.user,
    url.pathname,
  );

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    into: entry && {
      id: entry.id,
      titles: entry.events.map((event) => event.title),
      year: entry.events[0]?.year,
    },
    used: await listUsedCategories(db, timeline.id),
  };
};

export const actions: Actions = {
  default: async ({ platform, params, locals, url, request }) => {
    const form = await request.formData();
    const into = form.get("into");
    const { db, owner, timeline, user, entry } = await loadTarget(
      platform,
      params,
      typeof into === "string" && into ? into : null,
      locals.user,
      url.pathname,
    );

    const parsed = parseEntryForm(form);
    if (!parsed.ok) return fail(400, { message: parsed.message, values: Object.fromEntries(form) });

    if (entry) {
      // 束ねに足すだけ。ノートは entry のものが既にあるので触らない。
      await addEventToEntry(db, timeline.id, entry, user.id, parsed.value);
      throw redirect(303, `/@${owner.username}/${timeline.slug}/-/events/${entry.id}/edit`);
    }

    // 事実とノートを 1 枚のフォームで受け、event / note / entry に分けて置く。
    await createEntry(db, timeline.id, user.id, parsed.value);
    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
