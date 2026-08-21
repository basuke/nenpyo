import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { listNoteHistory } from "$lib/server/db";
import { loadTimelineContext } from "$lib/server/guards";

/** ノートの歴代。年表は誰でも読めるので、ここも誰でも見られる。 */
export const load: PageServerLoad = async ({ platform, params, locals }) => {
  const { owner, timeline } = await loadTimelineContext(platform, params, locals.user);

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, "そのノートは見つかりません");

  const { db } = await loadTimelineContext(platform, params, locals.user);
  const history = await listNoteHistory(db, id);
  if (!history.length) throw error(404, "そのノートは見つかりません");

  return {
    from: { username: owner.username, slug: timeline.slug, title: timeline.title },
    history: history.map((revision) => ({
      id: revision.id,
      depth: revision.depth,
      reason: revision.reason,
      tagline: revision.tagline,
      body: revision.body,
      updatedAt: revision.updated_at,
      author: revision.author && {
        username: revision.author.username,
        displayName: revision.author.display_name,
        avatarUrl: revision.author.avatar_url,
      },
    })),
  };
};
