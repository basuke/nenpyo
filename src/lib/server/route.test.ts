/**
 * 大枠のテスト。D1 には繋がない（docs/005-testing.md）。
 *
 * ここで見るのは #28 の主張そのもの — **同じ操作を通って同じ判断で同じエラーに
 * なり、違うのは扱いだけ**。同じ `AppError` を `page()` / `submit()` / `json()`
 * に流して、出てくる形だけが違うことを確かめる。
 */

import { describe, expect, it } from "vitest";
import { conflict, forbidden, invalid, notFound, unauthenticated } from "./errors";
import { json, page, submit } from "./route";
import type { AppContext } from "./context";
import type { RequestEvent } from "@sveltejs/kit";

const ORIGIN = "https://nenpyo.net";

/**
 * ルートが使う分だけの RequestEvent。`platform` は `requireDb` が
 * バインディングを取り出すのに要るだけで、中身は触られない。
 */
type EventInit = { path?: string; body?: unknown; method?: string; origin?: string | null };

function eventOf(init: EventInit = {}) {
  const url = new URL(`${ORIGIN}${init.path ?? "/@basuke/t"}`);
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = {};
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  return {
    url,
    locals: { user: null },
    platform: { env: { DB: {} as D1Database } },
    request: new Request(url, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  } as unknown as RequestEvent;
}

const throwing = (error: unknown) => async (_ctx: AppContext) => {
  throw error;
};

/** submit() は FormData を読むので、フォーム投稿の体裁にする。 */
function formEvent(values: Record<string, string | string[]> = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const one of Array.isArray(value) ? value : [value]) body.append(key, one);
  }
  const url = new URL(`${ORIGIN}/@basuke/t`);
  return {
    url,
    locals: { user: null },
    platform: { env: { DB: {} as D1Database } },
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  } as unknown as RequestEvent;
}

describe("同じ AppError が入り口ごとに違う形で出る", () => {
  /**
   * 唯一ほんとうに扱いが分かれるところ。画面には行き先があるのでログインへ送るが、
   * API には送る先が無いので 401 を返す。判断そのものは同じ。
   */
  it("sends a browser to the login page but answers an API caller with 401", async () => {
    const redirect = await page(eventOf(), throwing(unauthenticated())).catch((e) => e);
    expect(redirect).toMatchObject({
      status: 303,
      location: `/login?redirect=${encodeURIComponent("/@basuke/t")}`,
    });

    const response = await json(eventOf(), throwing(unauthenticated()));
    expect(response.status).toBe(401);
    // API でいちばん出るエラーなので、code 無しで返さない。
    await expect(response.json()).resolves.toEqual({
      error: { code: "sign_in_required", message: "ログインしてください" },
    });
  });

  // 書き直せば直るものは、フォームなら欄に戻す。API は同じ status を JSON で返す。
  it("puts a retryable failure in the form, and returns the same one as JSON", async () => {
    const error = invalid("だめ", "title_required");

    const failure = await submit(formEvent({ title: "" }), throwing(error));
    expect(failure).toMatchObject({
      status: 400,
      data: { code: "title_required", values: { title: "" } },
    });

    const response = await json(eventOf({ body: { title: "" } }), throwing(error));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "title_required", message: "だめ" },
    });
  });

  it("keeps the status and the code the same across both entry points", async () => {
    const errors = [
      forbidden("だめ", "not_owner"),
      notFound("ない", "entry_not_found"),
      conflict("ぶつかった", "slug_taken"),
    ];
    for (const error of errors) {
      const response = await json(eventOf(), throwing(error));
      expect(response.status).toBe(error.status);
      await expect(response.json()).resolves.toEqual({
        error: { code: error.code, message: error.message },
      });
    }
  });

  // 戻す場所が無いものはエラーページ。フォームでも API でも判断は同じ。
  it("does not put an unretryable failure back in the form", async () => {
    const refused = throwing(forbidden("だめ", "not_owner"));
    const thrown = await submit(formEvent(), refused).catch((e) => e);
    expect(thrown).toMatchObject({ status: 403 });
  });
});

describe("submit() の入力", () => {
  /**
   * チェックボックスの群れのように、同じ名前が複数来ることがある。
   * `Object.fromEntries()` は最後の 1 つしか残さないので、そのまま使うと
   * **黙って減る。** 同意画面（docs/007-mcp.md）が実際にこれで壊れていて、
   * 許したはずのスコープが落ちていた。
   */
  it("keeps every value when a field appears more than once", async () => {
    const event = formEvent({ scope: ["timeline:read", "note:write"], title: "あ" });
    const response = await submit(event, async (_ctx, input) => input);

    expect(response).toEqual({ scope: ["timeline:read", "note:write"], title: "あ" });
  });

  it("leaves a single value as a plain string, not an array of one", async () => {
    const response = await submit(
      formEvent({ scope: "timeline:read" }),
      async (_c, input) => input,
    );
    expect(response).toEqual({ scope: "timeline:read" });
  });
});

describe("json() の入力", () => {
  it("reads the body of a write and the query string of a read", async () => {
    const echo = async (_ctx: AppContext, input: unknown) => input;

    const written = await json(eventOf({ body: { title: "あ" } }), echo);
    await expect(written.json()).resolves.toEqual({ title: "あ" });

    const read = await json(eventOf({ path: "/api/timelines?limit=5" }), echo);
    await expect(read.json()).resolves.toEqual({ limit: "5" });
  });

  // 消すときのように、参照だけで足りる操作がある。fetch() はそういう DELETE に
  // Content-Type を付けないので、本体が無いときは求めない。
  it("accepts a write with no body at all", async () => {
    const response = await json(eventOf({ method: "DELETE" }), async (_c, input) => input);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({});
  });

  it("still refuses a bodyless write from another origin", async () => {
    const response = await json(
      eventOf({ method: "DELETE", origin: "https://evil.example" }),
      async () => ({ ok: true }),
    );
    expect(response.status).toBe(403);
  });

  it("reports malformed JSON as something the caller can fix", async () => {
    const url = new URL(`${ORIGIN}/api/x`);
    const event = {
      url,
      locals: { user: null },
      platform: { env: { DB: {} as D1Database } },
      request: new Request(url, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: "{oops",
      }),
    } as unknown as RequestEvent;

    const response = await json(event, async (_ctx, input) => input);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "malformed_json" } });
  });
});

describe("Cookie 認証の API を守るもの", () => {
  /**
   * この API は同一オリジン専用。Cookie で誰かを決めているので、他所のページから
   * 叩けてしまうと CSRF になる。読みは公開なので通す。
   */
  it("refuses a write from another origin", async () => {
    const response = await json(
      eventOf({ body: { title: "あ" }, origin: "https://evil.example" }),
      async () => ({ ok: true }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "bad_origin" } });
  });

  it("refuses a write with no Origin at all", async () => {
    const event = eventOf({ body: { title: "あ" }, origin: null });
    const response = await json(event, async () => ({ ok: true }));
    expect(response.status).toBe(403);
  });

  /**
   * `text/plain` は preflight を起こさない simple request なので、これを許すと
   * Origin だけが頼りになる。JSON に限っておけば、他所からの書き込みは
   * preflight で止まる。
   */
  it("refuses a content type that would slip past a preflight", async () => {
    const url = new URL(`${ORIGIN}/api/x`);
    const event = {
      url,
      locals: { user: null },
      platform: { env: { DB: {} as D1Database } },
      request: new Request(url, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "text/plain" },
        body: '{"title":"あ"}',
      }),
    } as unknown as RequestEvent;

    const response = await json(event, async () => ({ ok: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "bad_content_type" } });
  });

  it("lets a public read through without an Origin", async () => {
    const event = eventOf({ path: "/api/timelines", origin: null });
    const response = await json(event, async () => ({ ok: true }));
    expect(response.status).toBe(200);
  });
});
