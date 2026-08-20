import { describe, expect, it } from "vitest";
import { hashToken } from "./auth";

describe("hashToken", () => {
  it("produces a 64-character hex SHA-256 digest", async () => {
    const hash = await hashToken("a".repeat(64));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of a fixed input", async () => {
    // 取り違えや符号化ミスに気づけるよう、既知の値で固定しておく。
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, so the same cookie always finds its row", async () => {
    expect(await hashToken("token")).toBe(await hashToken("token"));
  });

  it("never returns the token itself", async () => {
    const token = "b".repeat(64);
    expect(await hashToken(token)).not.toBe(token);
  });

  it("differs for tokens that are one character apart", async () => {
    expect(await hashToken("token-a")).not.toBe(await hashToken("token-b"));
  });
});
