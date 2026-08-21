import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { findEntry, mergeEntries, type MergeNote } from "$lib/server/db";
import { loadTimelineContext, requireOwner } from "$lib/server/guards";
import type { MaybePlatform } from "$lib/server/platform";

/**
 * 束ねる 2 行を引く。
 *
 * どちらもこの年表のものでなければならない。entry は年表のもので、跨いで
 * 束ねると「どちらの年表の行なのか」が決まらなくなる（docs/003 3 章）。
 */
async function loadPair(
  platform: MaybePlatform,
  params: { username: string; slug: string; id: string },
  withId: string | null,
  user: App.Locals["user"],
  pathname: string,
) {
  const context = await loadTimelineContext(platform, params, user);
  requireOwner(user, context.owner.id, pathname);

  const targetId = Number(params.id);
  const sourceId = Number(withId);
  if (!Number.isInteger(targetId) || !Number.isInteger(sourceId)) {
    throw error(404, "束ねる相手が指定されていません");
  }
  if (targetId === sourceId) throw error(400, "同じ行同士は束ねられません");

  const target = await findEntry(context.db, context.timeline.id, targetId);
  const source = await findEntry(context.db, context.timeline.id, sourceId);
  if (!target || !source) throw error(404, "その行は見つかりません");

  return { ...context, target, source };
}

const view = (entry: Awaited<ReturnType<typeof findEntry>>) => ({
  id: entry!.id,
  titles: entry!.events.map((event) => event.title),
  noteId: entry!.note?.id ?? null,
  tagline: entry!.note?.tagline ?? null,
  body: entry!.note?.body ?? null,
});

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { owner, timeline, target, source } = await loadPair(
    platform,
    params,
    url.searchParams.get("with"),
    locals.user,
    url.pathname,
  );

  return {
    username: owner.username,
    timeline: { slug: timeline.slug, title: timeline.title },
    target: view(target),
    source: view(source),
  };
};

export const actions: Actions = {
  default: async ({ platform, params, locals, url, request }) => {
    const form = await request.formData();
    const { db, owner, timeline, target, source } = await loadPair(
      platform,
      params,
      String(form.get("with")),
      locals.user,
      url.pathname,
    );

    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    let choice: MergeNote;
    switch (form.get("choice")) {
      case "target":
        choice = { kind: "existing", noteId: target.note?.id ?? null };
        break;
      case "source":
        choice = { kind: "existing", noteId: source.note?.id ?? null };
        break;
      case "new":
        choice = { kind: "new", tagline: text("tagline"), body: text("body") };
        if (!choice.tagline && !choice.body) {
          return fail(400, { message: "新しいノートの中身が空です", values: Object.fromEntries(form) });
        }
        break;
      default:
        return fail(400, { message: "どのノートを採るか選んでください", values: Object.fromEntries(form) });
    }

    await mergeEntries(db, timeline.id, target, source, choice, locals.user!.id);

    throw redirect(303, `/@${owner.username}/${timeline.slug}`);
  },
};
