/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * `db.ts` をまるごと差し替えて、**誰が通れるか・何を弾くか・どのエラーに
 * なるか**だけを見る。SQL は一切見ない。そこは `*.d1.test.ts` の担当。
 *
 * ここで守りたいのは #28 の前提そのもの。認可も検証も**操作の中**で
 * 済んでいなければ、API を足したときに素通りする。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sql from "../db";
import type { AppContext } from "../context";
import type { SessionUser } from "../auth";
import type { TimelineWithOwner, UserRow } from "../db";
import { createTimeline, deleteTimeline, updateTimeline } from "./timelines";

vi.mock("../db");

// 欄を全部書いても読みやすくならないので、要る列だけ立てて型を被せる。
const OWNER = { id: 1, username: "basuke" } as UserRow;
const TIMELINE = { id: 10, owner_id: 1, slug: "t", title: "テスト" } as TimelineWithOwner;

const asUser = (row: UserRow): SessionUser => ({
  id: row.id,
  githubId: 1,
  username: row.username,
  displayName: null,
  avatarUrl: null,
});

const STRANGER: SessionUser = { ...asUser(OWNER), id: 99, username: "someone" };

const ctxOf = (user: SessionUser | null): AppContext => ({ db: {} as D1Database, user });

const REF = { username: "basuke", slug: "t" };
const VALID = { title: "テスト", slug: "t" };

beforeEach(() => {
  vi.mocked(sql.findUserByUsername).mockResolvedValue(OWNER);
  vi.mocked(sql.findTimeline).mockResolvedValue(TIMELINE);
});

describe("認可", () => {
  // 画面ならログインへ送り、API なら 401。その分かれ道は route.ts で、
  // 操作は「ログインしていない」とだけ言う。
  it("tells an anonymous caller to sign in rather than refusing outright", async () => {
    await expect(updateTimeline(ctxOf(null), REF, VALID)).rejects.toMatchObject({
      kind: "unauthenticated",
    });
  });

  it("refuses a signed-in stranger, and never reaches the write", async () => {
    await expect(updateTimeline(ctxOf(STRANGER), REF, VALID)).rejects.toMatchObject({
      kind: "forbidden",
      code: "not_owner",
    });
    expect(sql.updateTimeline).not.toHaveBeenCalled();
  });

  it("reports a missing owner as not found, not as a permission problem", async () => {
    vi.mocked(sql.findUserByUsername).mockResolvedValue(null);
    await expect(deleteTimeline(ctxOf(asUser(OWNER)), REF)).rejects.toMatchObject({
      kind: "notFound",
      code: "user_not_found",
    });
  });
});

describe("検証", () => {
  /**
   * 検証が**操作の中**で走ることを確かめる。ルート側でやっていると、
   * 同じ操作を API から呼んだときに素通りする（docs/004-layers.md 3 章）。
   */
  it("validates inside the operation, so no caller can skip it", async () => {
    await expect(
      createTimeline(ctxOf(asUser(OWNER)), "basuke", { title: "", slug: "t" }),
    ).rejects.toMatchObject({ kind: "invalid", code: "title_required" });
    expect(sql.createTimeline).not.toHaveBeenCalled();
  });

  // 認可が先。通らない人に入力の良し悪しを教える必要はない。
  it("checks who is asking before it checks what they typed", async () => {
    await expect(
      updateTimeline(ctxOf(STRANGER), REF, { title: "", slug: "" }),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });
});

describe("slug の重複", () => {
  /**
   * 一意を守っているのは UNIQUE 制約なので、判定もそこに任せる。手前で
   * SELECT して確かめても、その間に別のリクエストが入れば同じことになる。
   */
  it("turns the database's UNIQUE failure into something the form can show", async () => {
    vi.mocked(sql.createTimeline).mockRejectedValue(
      new Error("D1_ERROR: UNIQUE constraint failed: timelines.owner_id, timelines.slug"),
    );

    await expect(
      createTimeline(ctxOf(asUser(OWNER)), "basuke", VALID),
    ).rejects.toMatchObject({ kind: "conflict", code: "slug_taken" });
  });

  // UNIQUE 以外の障害まで握り潰すと、本当の故障が「slug が重複」に見える。
  it("lets any other database failure through untouched", async () => {
    vi.mocked(sql.createTimeline).mockRejectedValue(new Error("D1_ERROR: disk is full"));

    await expect(createTimeline(ctxOf(asUser(OWNER)), "basuke", VALID)).rejects.toThrow(
      /disk is full/,
    );
  });
});
