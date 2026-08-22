/**
 * 本物の D1 に当てるテスト（docs/005-testing.md）。
 *
 * ここで見るのは **SQL と制約の噛み合わせだけ**。認可も検証も `actions/` の
 * 仕事なので触らない。分けている理由は #29 で、あれは SQL 一本一本は正しく、
 * 実行の順序と `UNIQUE (timeline_id, event_id)` の噛み合わせだけが壊れていた。
 * D1 に繋がないテストでは制約が存在しないので、原理的に捕まらない。
 *
 * 対象は `timeline_entry_events` を組み替える 4 つと、ノートを複製する
 * `updateEntry`。読み取りは入れていない。壊れれば画面ですぐ分かる。
 */

import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as sql from "./db";

const db = env.DB;

// migrations/ をそのまま流す。テスト用のスキーマを別に持つと、#29 のように
// 「マイグレーションが既存コードの前提を壊す」事故が素通りする。
beforeAll(() => applyD1Migrations(db, env.TEST_MIGRATIONS));

const TABLES = [
  "derivations",
  "timeline_entry_events",
  "timeline_entries",
  "notes",
  "events",
  "timelines",
  "sessions",
  "users",
];

let user: sql.UserRow;
let timelineId: number;

beforeEach(async () => {
  for (const table of TABLES) await db.prepare(`DELETE FROM ${table}`).run();

  user = await sql.upsertUserFromGithub(db, {
    githubId: 1,
    username: "basuke",
    displayName: null,
    avatarUrl: null,
  });
  const timeline = await sql.createTimeline(db, {
    ownerId: user.id,
    slug: "t",
    title: "テスト",
    description: null,
  });
  timelineId = timeline!.id;
});

/** 年だけを変えた 1 行を作る。中身はどれでもよいので、呼ぶ側を短くする。 */
async function addEntry(year: number, title: string, note?: { tagline: string }) {
  return sql.createEntry(db, timelineId, user.id, {
    year,
    title,
    tagline: note?.tagline ?? null,
    body: null,
    category: null,
    subcategory: null,
    links: null,
  });
}

const entryOf = async (id: number) => (await sql.findEntry(db, timelineId, id))!;

/** その行が指しているイベントを、position の順にタイトルで並べる。 */
const titlesOf = async (id: number) => (await entryOf(id)).events.map((event) => event.title);

/** 1 つの年表に同じ出来事が二度刺さっていないか（migrations/0005）。 */
async function duplicatedEventIds(): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT event_id FROM timeline_entry_events
        GROUP BY timeline_id, event_id HAVING COUNT(*) > 1`,
    )
    .all<{ event_id: number }>();
  return results.map((row) => row.event_id);
}

describe("detachEvent", () => {
  /**
   * #29 の再発防止。
   *
   * 新しい行へ先に挿してから元の行を振り直すと、その一瞬だけ同じ出来事が
   * 同じ年表に 2 回刺さり、UNIQUE (timeline_id, event_id) で落ちる。
   * 順序を戻すとこのテストが落ちる。
   */
  it("takes the event off the old entry before putting it on the new one", async () => {
    const id = await addEntry(1970, "X");
    await sql.addEventToEntry(db, timelineId, await entryOf(id), user.id, {
      year: 1971,
      title: "Y",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });
    await sql.addEventToEntry(db, timelineId, await entryOf(id), user.id, {
      year: 1972,
      title: "Z",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });

    const bundled = await entryOf(id);
    const middle = bundled.events.find((event) => event.title === "Y")!;

    const detached = await sql.detachEvent(db, timelineId, bundled, middle.id);

    expect(await titlesOf(id)).toEqual(["X", "Z"]);
    expect(await titlesOf(detached)).toEqual(["Y"]);
    expect(await duplicatedEventIds()).toEqual([]);
  });

  /**
   * ノートは複製せず、そのまま共有する（docs/003-events-and-notes.md 5 章）。
   * 切り離しは人がやる編集行為で、その人が画面の前にいる。
   */
  it("leaves both rows pointing at the same note", async () => {
    const id = await addEntry(1970, "X", { tagline: "もとのノート" });
    await sql.addEventToEntry(db, timelineId, await entryOf(id), user.id, {
      year: 1971,
      title: "Y",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });

    const bundled = await entryOf(id);
    const second = bundled.events.find((event) => event.title === "Y")!;
    const detached = await sql.detachEvent(db, timelineId, bundled, second.id);

    expect((await entryOf(detached)).note?.id).toBe(bundled.note!.id);
  });
});

describe("addEventToEntry", () => {
  // 先頭のイベントが年表上の位置を決めるので、足したあとに日付順へ振り直す。
  it("resequences the bundle by date, so the earliest event leads", async () => {
    const id = await addEntry(1975, "あと");
    await sql.addEventToEntry(db, timelineId, await entryOf(id), user.id, {
      year: 1970,
      title: "さき",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });

    expect(await titlesOf(id)).toEqual(["さき", "あと"]);
    expect(await duplicatedEventIds()).toEqual([]);
  });
});

describe("mergeEntries", () => {
  it("folds both rows into one, ordered by date", async () => {
    const target = await addEntry(1972, "B", { tagline: "target のノート" });
    const source = await addEntry(1970, "A", { tagline: "source のノート" });

    await sql.mergeEntries(
      db,
      timelineId,
      await entryOf(target),
      await entryOf(source),
      { kind: "existing", noteId: (await entryOf(target)).note!.id },
      user.id,
    );

    expect(await titlesOf(target)).toEqual(["A", "B"]);
    expect(await sql.findEntry(db, timelineId, source)).toBeNull();
    expect(await duplicatedEventIds()).toEqual([]);
  });

  /**
   * 新しいノートを書いた場合、元の 2 本が derivations の親になる。
   * 親は凍結されるので、どちらも回収されずに残る（docs/003 の 6 章）。
   */
  it("keeps both original notes when a new one is written over them", async () => {
    const target = await addEntry(1972, "B", { tagline: "target のノート" });
    const source = await addEntry(1970, "A", { tagline: "source のノート" });
    const before = [(await entryOf(target)).note!.id, (await entryOf(source)).note!.id];

    await sql.mergeEntries(
      db,
      timelineId,
      await entryOf(target),
      await entryOf(source),
      { kind: "new", tagline: "まとめ直した", body: null },
      user.id,
    );

    const merged = await entryOf(target);
    expect(merged.note?.tagline).toBe("まとめ直した");

    const history = await sql.listNoteHistory(db, merged.note!.id);
    expect(history.map((revision) => revision.id)).toEqual(expect.arrayContaining(before));
  });
});

describe("placeEntry", () => {
  /**
   * events は複製しない。両方の年表が同じ行を指す（docs/003 の 5 章）。
   * 「何が起きたか」は同じ行に寄っていてほしい素材なので、複製すると
   * 名寄せしたい対象を名寄せの逆方向へ散らかすことになる。
   */
  it("points the new row at the same event instead of copying it", async () => {
    const mine = await sql.createTimeline(db, {
      ownerId: user.id,
      slug: "mine",
      title: "こっち",
      description: null,
    });
    const sourceId = await addEntry(1970, "A", { tagline: "元のノート" });
    const source = await entryOf(sourceId);

    const placed = await sql.placeEntry(db, mine!.id, source, { kind: "share" }, user.id);

    const landed = (await sql.findEntry(db, mine!.id, placed))!;
    expect(landed.events.map((event) => event.id)).toEqual(source.events.map((e) => e.id));
    expect(landed.note?.id).toBe(source.note?.id);
    expect(await duplicatedEventIds()).toEqual([]);
  });

  // 1 つの年表に同じ出来事は一度だけ（migrations/0005）。最後の砦は DB に置く。
  it("refuses to put the same event on one timeline twice", async () => {
    const sourceId = await addEntry(1970, "A");
    const source = await entryOf(sourceId);

    await expect(
      sql.placeEntry(db, timelineId, source, { kind: "none" }, user.id),
    ).rejects.toThrow();
  });
});

describe("updateEntry", () => {
  /**
   * 参照が 2 本あるノートは凍結されていて、直すと複製される
   * （docs/003 の 5 章）。切り離したあとの 2 行は同じノートを指しているので、
   * これが無いと片方を直したときにもう片方が動く。
   */
  it("forks a shared note so the other row does not move with it", async () => {
    const id = await addEntry(1970, "X", { tagline: "もとのノート" });
    await sql.addEventToEntry(db, timelineId, await entryOf(id), user.id, {
      year: 1971,
      title: "Y",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });
    const bundled = await entryOf(id);
    const second = bundled.events.find((event) => event.title === "Y")!;
    const detached = await sql.detachEvent(db, timelineId, bundled, second.id);

    await sql.updateEntry(
      db,
      timelineId,
      await entryOf(detached),
      {
        year: 1971,
        title: "Y",
        tagline: "こちらだけ直した",
        body: null,
        category: null,
        subcategory: null,
        links: null,
      },
      user.id,
    );

    expect((await entryOf(detached)).note?.tagline).toBe("こちらだけ直した");
    expect((await entryOf(id)).note?.tagline).toBe("もとのノート");

    // どこから来たかは derivations が語る。
    const history = await sql.listNoteHistory(db, (await entryOf(detached)).note!.id);
    expect(history.map((revision) => revision.reason)).toContain("編集による複製");
  });

  // 参照が 1 本しかないノートは凍結されていないので、その場で書き換わる。
  it("edits a note in place while only one row points at it", async () => {
    const id = await addEntry(1970, "X", { tagline: "もとのノート" });
    const before = (await entryOf(id)).note!.id;

    await sql.updateEntry(
      db,
      timelineId,
      await entryOf(id),
      {
        year: 1970,
        title: "X",
        tagline: "直した",
        body: null,
        category: null,
        subcategory: null,
        links: null,
      },
      user.id,
    );

    const after = await entryOf(id);
    expect(after.note?.id).toBe(before);
    expect(after.note?.tagline).toBe("直した");
  });
});
