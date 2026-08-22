/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * 束ねの組み替えは、画面の側で候補を絞っている。**絞り込みは親切であって
 * 検査ではない**ので、URL を直に叩かれたときに操作の側で止まることを見る
 * （docs/004-layers.md 7 章）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sql from "../db";
import type { AppContext } from "../context";
import type { SessionUser } from "../auth";
import type { EventRow, TimelineEntry, TimelineWithOwner, UserRow } from "../db";
import { detachEvent, mergeEntries, reorderEvents } from "./bundles";

vi.mock("../db");

const OWNER = { id: 1, username: "basuke" } as UserRow;
const TIMELINE = { id: 10, owner_id: 1, slug: "t" } as TimelineWithOwner;
const USER: SessionUser = {
  id: 1,
  githubId: 1,
  username: "basuke",
  displayName: null,
  avatarUrl: null,
};

const ctx: AppContext = { db: {} as D1Database, user: USER };

const event = (id: number, year: number): EventRow =>
  ({ id, year, month: null, day: null, hour: null, minute: null, precision: "year" }) as EventRow;

const entry = (id: number, events: EventRow[]): TimelineEntry =>
  ({ id, position: 0, note: null, author: null, ancestors: [], events }) as TimelineEntry;

const REF = { username: "basuke", slug: "t", entryId: 1 };

beforeEach(() => {
  vi.mocked(sql.findUserByUsername).mockResolvedValue(OWNER);
  vi.mocked(sql.findTimeline).mockResolvedValue(TIMELINE);
});

describe("detachEvent", () => {
  it("refuses to detach from a row that is not bundled", async () => {
    vi.mocked(sql.findEntry).mockResolvedValue(entry(1, [event(100, 1970)]));

    await expect(detachEvent(ctx, REF, { eventId: 100 })).rejects.toMatchObject({
      kind: "invalid",
      code: "not_bundled",
    });
    expect(sql.detachEvent).not.toHaveBeenCalled();
  });

  // 画面には出ない組み合わせだが、id は直に叩ける。
  it("refuses an event that belongs to some other row", async () => {
    vi.mocked(sql.findEntry).mockResolvedValue(entry(1, [event(100, 1970), event(101, 1971)]));

    await expect(detachEvent(ctx, REF, { eventId: 999 })).rejects.toMatchObject({
      kind: "invalid",
      code: "event_not_in_entry",
    });
    expect(sql.detachEvent).not.toHaveBeenCalled();
  });
});

describe("reorderEvents", () => {
  it("moves an event one place within the bundle", async () => {
    vi.mocked(sql.findEntry).mockResolvedValue(entry(1, [event(100, 1970), event(101, 1971)]));

    await reorderEvents(ctx, REF, { eventId: 101, direction: "up" });

    expect(sql.reorderEntryEvents).toHaveBeenCalledWith(
      ctx.db,
      TIMELINE.id,
      expect.anything(),
      [101, 100],
    );
  });

  it("refuses to move the leading event any further up", async () => {
    vi.mocked(sql.findEntry).mockResolvedValue(entry(1, [event(100, 1970), event(101, 1971)]));

    await expect(reorderEvents(ctx, REF, { eventId: 100, direction: "up" })).rejects.toMatchObject({
      kind: "invalid",
      code: "cannot_move",
    });
  });
});

describe("mergeEntries", () => {
  it("refuses to bundle a row with itself", async () => {
    vi.mocked(sql.findEntry).mockResolvedValue(entry(1, [event(100, 1970)]));

    await expect(mergeEntries(ctx, REF, { with: 1, choice: "target" })).rejects.toMatchObject({
      kind: "invalid",
      code: "same_entry",
    });
  });

  /**
   * 束ねた行は年表の 1 か所に出るので、そこに収まらない期間の出来事が
   * 混ざると行の位置が嘘になる（docs/003-events-and-notes.md 4 章）。
   * 画面では候補から外しているが、ここでも見る。
   */
  it("refuses two rows whose events cannot share one period", async () => {
    vi.mocked(sql.findEntry)
      .mockResolvedValueOnce(entry(1, [event(100, 1970)]))
      .mockResolvedValueOnce(entry(2, [event(200, 1999)]));

    await expect(mergeEntries(ctx, REF, { with: 2, choice: "target" })).rejects.toMatchObject({
      kind: "invalid",
      code: "not_bundleable",
    });
    expect(sql.mergeEntries).not.toHaveBeenCalled();
  });

  // note_id は 1 本しか刺さらないので、既定で片方を採ると黙ってもう片方が消える。
  it("insists on being told which note to keep", async () => {
    vi.mocked(sql.findEntry)
      .mockResolvedValueOnce(entry(1, [event(100, 1970)]))
      .mockResolvedValueOnce(entry(2, [event(200, 1970)]));

    await expect(mergeEntries(ctx, REF, { with: 2 })).rejects.toMatchObject({
      kind: "invalid",
      code: "note_choice_required",
    });
    expect(sql.mergeEntries).not.toHaveBeenCalled();
  });
});
