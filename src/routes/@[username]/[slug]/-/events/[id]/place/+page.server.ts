import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  eventsAlreadyIn,
  findEntry,
  listTimelinesByOwner,
  placeEntry,
  type PlacedNote,
} from "$lib/server/db";
import { loadTimelineContext } from "$lib/server/guards";
import type { MaybePlatform } from "$lib/server/platform";

/**
 * 載せる元の行と、載せ先にできる自分の年表を引く。
 *
 * 元の年表は誰のものでもよい。年表は全部公開で読めるので、ログインしていて
 * 自分の年表があれば載せられる（docs/003-events-and-notes.md）。
 */
async function loadSource(
  platform: MaybePlatform,
  params: { username: string; slug: string; id: string },
  user: App.Locals["user"],
  pathname: string,
) {
  if (!user) throw redirect(303, `/login?redirect=${encodeURIComponent(pathname)}`);

  const context = await loadTimelineContext(platform, params, user);

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "その行は見つかりません");

  const source = await findEntry(context.db, context.timeline.id, id);
  if (!source) throw error(404, "その行は見つかりません");

  return { ...context, user, source };
}

export const load: PageServerLoad = async ({ platform, params, locals, url }) => {
  const { db, owner, timeline, user, source } = await loadSource(
    platform,
    params,
    locals.user,
    url.pathname,
  );

  const eventIds = source.events.map((event) => event.id);
  const mine = await listTimelinesByOwner(db, user.id);

  // 1 つの年表に同じ出来事は一度だけ（migrations/0005）。既に持っている年表は
  // 選べないので、その理由ごと出す。
  const targets = [];
  for (const candidate of mine) {
    if (candidate.id === timeline.id) continue;
    const already = await eventsAlreadyIn(db, candidate.id, eventIds);
    targets.push({
      id: candidate.id,
      title: candidate.title,
      slug: candidate.slug,
      taken: already.length,
    });
  }

  return {
    from: { username: owner.username, slug: timeline.slug, title: timeline.title },
    source: {
      id: source.id,
      titles: source.events.map((event) => event.title),
      year: source.events[0]?.year,
      tagline: source.note?.tagline ?? null,
      body: source.note?.body ?? null,
      author: source.note && source.author ? source.author.display_name ?? source.author.username : null,
      hasNote: Boolean(source.note),
    },
    targets,
  };
};

export const actions: Actions = {
  default: async ({ platform, params, locals, url, request }) => {
    const { db, user, source } = await loadSource(platform, params, locals.user, url.pathname);

    const form = await request.formData();
    const timelineId = Number(form.get("timelineId"));
    if (!Number.isInteger(timelineId)) return fail(400, { message: "載せる年表を選んでください", values: Object.fromEntries(form) });

    // 自分の年表かどうかは、ここで必ず確かめる。フォームの値は信用しない。
    const mine = await listTimelinesByOwner(db, user.id);
    const target = mine.find((candidate) => candidate.id === timelineId);
    if (!target) return fail(403, { message: "その年表には載せられません", values: Object.fromEntries(form) });

    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    let note: PlacedNote;
    switch (form.get("note")) {
      case "share":
        note = { kind: "share" };
        break;
      case "own":
        note = { kind: "own", tagline: text("tagline"), body: text("body") };
        break;
      default:
        note = { kind: "none" };
    }

    const eventIds = source.events.map((event) => event.id);
    const already = await eventsAlreadyIn(db, timelineId, eventIds);
    if (already.length) {
      return fail(409, {
        message: "その年表には、この出来事がもう載っています",
        values: Object.fromEntries(form),
      });
    }

    await placeEntry(db, timelineId, source, note, user.id);

    throw redirect(303, `/@${user.username}/${target.slug}`);
  },
};
