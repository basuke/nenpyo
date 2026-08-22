/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * 「載せる」は**他人の年表から始まる**唯一の操作なので、認可の形が他と違う。
 * 元の年表は誰のものでもよく、確かめるのは載せ先が自分のものかどうか。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sql from "../db";
import type { AppContext } from "../context";
import type { SessionUser } from "../auth";
import type { EventRow, TimelineEntry, TimelineWithOwner, UserRow } from "../db";
import { placeEntry } from "./place";

vi.mock("../db");

const STRANGER = { id: 2, username: "someone" } as UserRow;
const THEIRS = { id: 20, owner_id: 2, slug: "sf" } as TimelineWithOwner;
const MINE = { id: 10, owner_id: 1, slug: "mine", title: "こっち" } as TimelineWithOwner;

const USER: SessionUser = {
  id: 1,
  githubId: 1,
  username: "basuke",
  displayName: null,
  avatarUrl: null,
};

const ctxOf = (user: SessionUser | null): AppContext => ({ db: {} as D1Database, user });

const SOURCE = {
  id: 5,
  position: 0,
  note: null,
  author: null,
  ancestors: [],
  events: [{ id: 100, year: 1970 } as EventRow],
} as TimelineEntry;

const REF = { username: "someone", slug: "sf", entryId: 5 };

beforeEach(() => {
  vi.mocked(sql.findUserByUsername).mockResolvedValue(STRANGER);
  vi.mocked(sql.findTimeline).mockResolvedValue(THEIRS);
  vi.mocked(sql.findEntry).mockResolvedValue(SOURCE);
  vi.mocked(sql.listTimelinesByOwner).mockResolvedValue([MINE]);
  vi.mocked(sql.eventsAlreadyIn).mockResolvedValue([]);
});

it("lets anyone signed in place a row from someone else's timeline", async () => {
  const to = await placeEntry(ctxOf(USER), REF, { timelineId: MINE.id, note: "share" });

  expect(to).toEqual({ username: "basuke", slug: "mine" });
  expect(sql.placeEntry).toHaveBeenCalledWith(
    expect.anything(),
    MINE.id,
    SOURCE,
    { kind: "share" },
    USER.id,
  );
});

it("tells an anonymous caller to sign in", async () => {
  await expect(
    placeEntry(ctxOf(null), REF, { timelineId: MINE.id }),
  ).rejects.toMatchObject({ kind: "unauthenticated" });
});

/**
 * 載せ先が自分の年表かどうかは、入力の値を信用せずここで確かめる。
 * 画面には自分の年表しか出ないが、id は直に投げられる。
 */
it("refuses to place onto a timeline the caller does not own", async () => {
  await expect(
    placeEntry(ctxOf(USER), REF, { timelineId: THEIRS.id, note: "share" }),
  ).rejects.toMatchObject({ kind: "forbidden", code: "not_own_timeline" });
  expect(sql.placeEntry).not.toHaveBeenCalled();
});

// 選び直せば済むので notFound ではなく invalid。フォームならそのまま戻せる。
it("asks for a destination rather than reporting one missing", async () => {
  await expect(placeEntry(ctxOf(USER), REF, {})).rejects.toMatchObject({
    kind: "invalid",
    code: "timeline_required",
  });
});

/**
 * 1 つの年表に同じ出来事は一度だけ（migrations/0005）。守っているのは DB の
 * 制約だが、載せる前に理由を返せるようにここでも見る。
 */
it("says the event is already there instead of letting the constraint fire", async () => {
  vi.mocked(sql.eventsAlreadyIn).mockResolvedValue([100]);

  await expect(
    placeEntry(ctxOf(USER), REF, { timelineId: MINE.id, note: "share" }),
  ).rejects.toMatchObject({ kind: "conflict", code: "already_placed" });
  expect(sql.placeEntry).not.toHaveBeenCalled();
});

// 何も選ばなければノートは付かない。事実だけ持ってくるのがいちばん軽い載せ方。
it("carries no note over unless asked", async () => {
  await placeEntry(ctxOf(USER), REF, { timelineId: MINE.id });

  expect(sql.placeEntry).toHaveBeenCalledWith(
    expect.anything(),
    MINE.id,
    SOURCE,
    { kind: "none" },
    USER.id,
  );
});
