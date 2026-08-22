/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * Streamable HTTP の枠だけを見る。2026-07-28 でセッションと GET ストリームが
 * 消えたので、**古い流儀で来たものを正しく断れるか**が要になる。
 */

import { describe, expect, it, vi } from "vitest";
import { handleMcpRequest } from "./http";
import { ErrorCode } from "./server";
import type { AppContext } from "../context";

vi.mock("../db");

const ORIGIN = "https://nenpyo.net";
const ctx: AppContext = { db: {} as D1Database, user: null };
const ALL = ["timeline:read", "note:write", "event:write"];

function post(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`${ORIGIN}/mcp`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

describe("古い流儀で来たものを断る", () => {
  /**
   * 2025-03-26〜2025-11-25 のクライアントは GET でストリームを開き、
   * DELETE でセッションを畳もうとする。どちらも今の仕様には無い。
   */
  it.each(["GET", "DELETE"])("answers %s with 405 and says what it allows", async (method) => {
    const response = await handleMcpRequest(post(null, {}, method), ctx, ALL);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  // セッション id は無視する。反響もしないし、発行もしない。
  it("ignores a session id instead of echoing one back", async () => {
    const response = await handleMcpRequest(post(ping, { "mcp-session-id": "abc" }), ctx, ALL);
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("Origin", () => {
  /**
   * DNS rebinding 対策（仕様が MUST と言っている）。遠隔のクライアントは
   * Origin を付けてこないので、**あるときだけ**見る。
   */
  it("lets a request with no Origin through, since remote clients send none", async () => {
    expect((await handleMcpRequest(post(ping), ctx, ALL)).status).toBe(200);
  });

  it("refuses a request that claims another origin", async () => {
    const elsewhere = post(ping, { origin: "https://evil.example" });
    const response = await handleMcpRequest(elsewhere, ctx, ALL);
    expect(response.status).toBe(403);
  });

  it("lets its own origin through", async () => {
    expect((await handleMcpRequest(post(ping, { origin: ORIGIN }), ctx, ALL)).status).toBe(200);
  });
});

describe("ヘッダと本文の一致", () => {
  /**
   * 経路の途中にいるものがヘッダで判断し、サーバーが本文で動くと、同じ要求が
   * 二通りに読める。仕様が -32020 を定めているのはそのため。
   */
  it("refuses a method header that disagrees with the body", async () => {
    const response = await handleMcpRequest(
      post(ping, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call" }),
      ctx,
      ALL,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.headerMismatch },
    });
  });

  it("refuses a protocol version header that disagrees with the body", async () => {
    const body = {
      ...ping,
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2025-06-18" } },
    };
    const response = await handleMcpRequest(
      post(body, { "mcp-protocol-version": "2026-07-28" }),
      ctx,
      ALL,
    );
    expect(response.status).toBe(400);
  });

  it("accepts headers that agree with the body", async () => {
    const response = await handleMcpRequest(
      post(ping, { "mcp-protocol-version": "2026-07-28", "mcp-method": "ping" }),
      ctx,
      ALL,
    );
    expect(response.status).toBe(200);
  });

  /**
   * 2025-03-26 以前のクライアントはこのヘッダ自体を送ってこない。
   * 求めると繋がらないので、無いものは検証しない。
   */
  it("does not demand headers a pre-2025-06-18 client never sends", async () => {
    expect((await handleMcpRequest(post(ping), ctx, ALL)).status).toBe(200);
  });

  // ASCII に収まらない値は =?base64?…?= で包まれてくる。解いてから比べる。
  it("decodes a base64-wrapped name before comparing it", async () => {
    const name = "日本語";
    const wrapped = `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=`;
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } };

    const response = await handleMcpRequest(
      post(body, { "mcp-protocol-version": "2026-07-28", "mcp-name": wrapped }),
      ctx,
      ALL,
    );
    // 名前は一致しているので -32020 にはならない。知らない tool として弾かれる。
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.invalidParams },
    });
  });
});

describe("応答の形", () => {
  // 通知に本文を返してはいけない。
  it("answers a notification with 202 and an empty body", async () => {
    const response = await handleMcpRequest(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
      ctx,
      ALL,
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  /**
   * 知らない method は 404。本文に JSON-RPC のエラーを入れるのは、古い
   * HTTP+SSE のサーバーが返す素の 404 と見分けるため（仕様の Backward
   * Compatibility）。ここが素の 404 だと、クライアントが古い流儀へ落ちる。
   */
  it("marks an unknown method with 404 and a JSON-RPC body, not a bare 404", async () => {
    const response = await handleMcpRequest(
      post({ jsonrpc: "2.0", id: 1, method: "nope" }),
      ctx,
      ALL,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.methodNotFound },
    });
  });

  it("reports malformed JSON as a parse error", async () => {
    const request = new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });
    const response = await handleMcpRequest(request, ctx, ALL);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ErrorCode.parse } });
  });
});

describe("スコープ不足", () => {
  /**
   * tool の失敗ではなく認可の失敗なので、HTTP の側で返す。
   * **何があれば足りるかを添える**（RFC 6750 3.1）。これが無いと、
   * クライアントは足りない分を足した再認可に進めない。
   */
  it("answers with 403 and names the scope that would be enough", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_event", arguments: {} },
    };
    const response = await handleMcpRequest(post(body), ctx, ["timeline:read"]);

    expect(response.status).toBe(403);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="event:write"');
  });
});
