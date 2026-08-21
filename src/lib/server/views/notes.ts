/** ノートの歴代。年表は誰でも読めるので、ここも誰でも見られる。 */

import { notFound } from "../errors";
import { resolveTimeline, toId, type AppContext, type Id, type TimelineRef } from "../context";
import * as sql from "../db";

export async function noteHistoryView(ctx: AppContext, ref: TimelineRef, noteId: Id) {
  const { owner, timeline } = await resolveTimeline(ctx, ref);

  const missing = "そのノートは見つかりません";
  const history = await sql.listNoteHistory(ctx.db, toId(noteId, missing));
  if (!history.length) throw notFound(missing, "note_not_found");

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
}
