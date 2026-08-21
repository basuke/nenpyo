/**
 * 他人の年表にある行を、自分の年表にも「載せる」。
 *
 * 元の年表は誰のものでもよい。年表は全部公開で読めるので、ログインしていて
 * 自分の年表があれば載せられる。**events は複製されず、両方の年表が同じ行を
 * 指す**（docs/003-events-and-notes.md 5 章）。
 */

import { conflict, forbidden, invalid } from "../errors";
import { requireSignedInEntry, type AppContext, type EntryRef } from "../context";
import { parsePlacedNote, type RawInput } from "../input";
import * as sql from "../db";

export async function placeEntry(ctx: AppContext, ref: EntryRef, raw: RawInput) {
  const { user, entry } = await requireSignedInEntry(ctx, ref);

  // 載せ先が自分の年表かどうかは、ここで必ず確かめる。入力の値は信用しない。
  // 選び直せば済むので notFound ではなく invalid。フォームならそのまま戻せる。
  const timelineId = Number(raw.timelineId);
  if (!Number.isInteger(timelineId)) {
    throw invalid("載せる年表を選んでください", "timeline_required");
  }

  const mine = await sql.listTimelinesByOwner(ctx.db, user.id);
  const target = mine.find((candidate) => candidate.id === timelineId);
  if (!target) throw forbidden("その年表には載せられません", "not_own_timeline");

  // 1 つの年表に同じ出来事は一度だけ（migrations/0005）。守っているのは DB の
  // 制約だが、載せる前に理由を返せるようにここでも見る。
  const eventIds = entry.events.map((event) => event.id);
  if ((await sql.eventsAlreadyIn(ctx.db, timelineId, eventIds)).length) {
    throw conflict("その年表には、この出来事がもう載っています", "already_placed");
  }

  await sql.placeEntry(ctx.db, timelineId, entry, parsePlacedNote(raw), user.id);

  return { username: user.username, slug: target.slug };
}
