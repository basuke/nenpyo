import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("coming-soon worker", () => {
  it("returns 503 for the root path", async () => {
    const res = await SELF.fetch("https://nenpyo.net/");
    expect(res.status).toBe(503);
  });

  it("returns 503 for any arbitrary path", async () => {
    const res = await SELF.fetch("https://nenpyo.net/whatever/deep/path");
    expect(res.status).toBe(503);
  });

  it("sets a Retry-After header", async () => {
    const res = await SELF.fetch("https://nenpyo.net/");
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("serves the coming-soon HTML content", async () => {
    const res = await SELF.fetch("https://nenpyo.net/");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("どーも、バスケです");
    expect(body).toContain("nenpyo.net");
    expect(body).toContain("近日公開");
  });

  it("responds to POST as well (catch-all)", async () => {
    const req = new Request("https://nenpyo.net/api", { method: "POST" });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(503);
  });
});
