import { describe, expect, it } from "vitest";
import {
  AppError,
  conflict,
  forbidden,
  invalid,
  isAppError,
  isRetryable,
  notFound,
} from "./errors";

describe("AppError", () => {
  it("derives the HTTP status from the kind, so callers never pick a number", () => {
    expect(invalid("だめ").status).toBe(400);
    expect(forbidden("だめ").status).toBe(403);
    expect(notFound("ない").status).toBe(404);
    expect(conflict("ぶつかった").status).toBe(409);
  });

  it("is recognisable after being thrown and caught as unknown", () => {
    let caught: unknown;
    try {
      throw notFound("ない");
    } catch (cause) {
      caught = cause;
    }
    expect(isAppError(caught)).toBe(true);
    expect(isAppError(new Error("ない"))).toBe(false);
  });

  it("keeps a machine-readable code alongside the Japanese message", () => {
    const error = conflict("slug「x」は既に使われています", "slug_taken");
    expect(error.code).toBe("slug_taken");
    expect(error.message).toMatch(/既に使われています/);
  });
});

describe("isRetryable", () => {
  // フォームに戻して直せるのはこの 2 つだけ。403 や 404 を欄に戻しても
  // 書き直しようがないので、そちらはエラーページになる（route.ts）。
  it("marks only the failures a person can fix by editing the form", () => {
    expect(isRetryable(invalid("だめ"))).toBe(true);
    expect(isRetryable(conflict("ぶつかった"))).toBe(true);
    expect(isRetryable(forbidden("だめ"))).toBe(false);
    expect(isRetryable(notFound("ない"))).toBe(false);
    expect(isRetryable(new AppError("unauthenticated", "ログインして"))).toBe(false);
  });
});
