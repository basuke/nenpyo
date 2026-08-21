/** ノートの歴代。年表は誰でも読めるので、ここも誰でも見られる。 */

import { notFound } from "../errors";
import { resolveTimeline, toId, type AppContext, type Id, type TimelineRef } from "../context";
import * as sql from "../db";
import type { TimelineOrigin } from "./common";

/**
 * 歴代の 1 本。
 *
 * `depth` は今のノートからの距離で、0 が現役。複製が起きるのは凍結された
 * ノートに手を入れたときと、束ねを統合したとき。後者は親が 2 つになるので、
 * **同じ depth に複数並ぶことがある**（docs/003-events-and-notes.md 5 章）。
 */
export type NoteRevisionView = {
  id: number;
  depth: number;
  /** なぜ複製されたか。「編集による複製」「束ねによる統合」 */
  reason: string | null;
  tagline: string | null;
  body: string | null;
  updatedAt: string;
  author: { username: string; displayName: string | null; avatarUrl: string | null } | null;
};

export type NoteHistoryView = { from: TimelineOrigin; history: NoteRevisionView[] };

export async function noteHistoryView(
  ctx: AppContext,
  ref: TimelineRef,
  noteId: Id,
): Promise<NoteHistoryView> {
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
