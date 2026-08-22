/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * MCP は 3 つ目の入り口でしかないので、ここで見るのは**入り口としての振る舞い**
 * だけ。tool の中身（認可・検証）は `actions/` 側で既に見ている。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sql from "../db";
import { handleMessage, ErrorCode } from "./server";
import { SCOPES, TOOLS, toolsFor } from "./tools";
import type { AppContext } from "../context";
import type { SessionUser } from "../auth";
import type { TimelineWithOwner, UserRow } from "../db";

vi.mock("../db");

const USER: SessionUser = {
  id: 1,
  githubId: 1,
  username: "basuke",
  displayName: null,
  avatarUrl: null,
};

const ctx: AppContext = { db: {} as D1Database, user: USER };

const OWNER = { id: 1, username: "basuke" } as UserRow;
const TIMELINE = { id: 10, owner_id: 1, slug: "t" } as TimelineWithOwner;
const THEIRS = { id: 20, owner_id: 99, slug: "sf" } as TimelineWithOwner;
const ALL = [...SCOPES];

const call = (name: string, args: Record<string, unknown> = {}, granted = ALL) =>
  handleMessage(
    ctx,
    granted,
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  );

/** 応答から result を取り出す。エラーだったら分かる形で落とす。 */
function resultOf(response: Awaited<ReturnType<typeof handleMessage>>) {
  if (!response || !("result" in response)) {
    throw new Error(`expected a result: ${JSON.stringify(response)}`);
  }
  return response.result as { isError?: boolean; structuredContent: Record<string, unknown> };
}

beforeEach(() => {
  vi.mocked(sql.findUserByUsername).mockResolvedValue(OWNER);
  vi.mocked(sql.findTimeline).mockResolvedValue(TIMELINE);
});

describe("スコープ", () => {
  /**
   * 使えないものを目録に出すと、AI が呼んでから断られることになる。
   * できないことは見せないほうが、無駄な往復が減る。
   */
  it("only lists the tools the token was granted", async () => {
    const response = await handleMessage(ctx, ["timeline:read"], {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const { tools } = resultOf(response) as unknown as { tools: { name: string }[] };
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("get_timeline");
    expect(names).not.toContain("write_note");
    expect(names).not.toContain("add_event");
  });

  // 目録から消えていても、名前を知っていれば呼べてしまう。呼ばれても止まること。
  it("refuses a tool that is missing from the list but called anyway", async () => {
    const denied = call("add_event", { username: "basuke", slug: "t" }, ["timeline:read"]);

    await expect(denied).rejects.toMatchObject({
      kind: "forbidden",
      code: "insufficient_scope",
    });
    expect(sql.createEntry).not.toHaveBeenCalled();
  });

  it("covers every tool with a scope that actually exists", () => {
    for (const tool of TOOLS) expect(SCOPES).toContain(tool.scope);
    expect(toolsFor([]).length).toBe(0);
  });
});

describe("tools/call", () => {
  /**
   * 操作が投げた AppError は JSON-RPC の失敗ではなく tool の結果にする。
   * 「他人の年表は編集できません」は protocol の故障ではなく、AI が読んで
   * やり直せる筋の話なので。
   */
  it("hands an operation's refusal back as a readable tool error", async () => {
    vi.mocked(sql.findUserByUsername).mockResolvedValue({ id: 99, username: "someone" } as UserRow);
    vi.mocked(sql.findTimeline).mockResolvedValue(THEIRS);

    const args = { username: "someone", slug: "sf", year: 1970, title: "X" };
    const result = resultOf(await call("add_event", args));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: "not_owner" } });
    expect(sql.createEntry).not.toHaveBeenCalled();
  });

  // 検証も操作の中で走る。MCP から入っても素通りしない。
  it("runs the same validation the form and the API run", async () => {
    const args = { username: "basuke", slug: "t", year: 99999, title: "X" };
    const result = resultOf(await call("add_event", args));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: "year_out_of_range" } });
  });

  it("reports an unknown tool as a protocol error, not a tool error", async () => {
    const response = await call("drop_everything");
    expect(response).toMatchObject({ error: { code: ErrorCode.invalidParams } });
  });

  // AI は URL から拾ってくるので @ 付きで呼んでくることがある。
  it("accepts a username with or without the leading @", async () => {
    vi.mocked(sql.listEntries).mockResolvedValue([]);
    vi.mocked(sql.listUsedCategories).mockResolvedValue([]);

    await call("get_timeline", { username: "@basuke", slug: "t" });
    expect(sql.findUserByUsername).toHaveBeenCalledWith(expect.anything(), "basuke");
  });
});

describe("JSON-RPC の枠", () => {
  it("answers an unknown method with method-not-found", async () => {
    const response = await handleMessage(
      ctx,
      ALL,
      { jsonrpc: "2.0", id: 1, method: "resources/list" },
    );
    expect(response).toMatchObject({ error: { code: ErrorCode.methodNotFound } });
  });

  // 通知には応答を返さない。呼ぶ側はこれを 202 にする。
  it("returns nothing for a notification", async () => {
    const response = await handleMessage(ctx, ALL, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(response).toBeNull();
  });

  /**
   * 古い流儀のクライアントは initialize から始める。話せる版ならその版を返し、
   * 知らない版でも拒まずこちらの最新を返す。tools の形はどの版でも同じなので。
   */
  it("echoes a protocol version it knows, and falls back for one it does not", async () => {
    const known = await handleMessage(ctx, ALL, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect(resultOf(known)).toMatchObject({ protocolVersion: "2025-06-18" });

    const unknown = await handleMessage(ctx, ALL, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect(resultOf(unknown)).toMatchObject({ protocolVersion: "2026-07-28" });
  });
});
