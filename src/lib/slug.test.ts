import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeSlug, slugError } from "./slug";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumerics and hyphens", () => {
    expect(isValidSlug("sf-tech-lifeline")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("2026")).toBe(true);
  });

  it("rejects a leading hyphen so it can never collide with /-/", () => {
    expect(isValidSlug("-")).toBe(false);
    expect(isValidSlug("-new")).toBe(false);
  });

  it("rejects uppercase, spaces, Japanese, and over-long input", () => {
    expect(isValidSlug("SF")).toBe(false);
    expect(isValidSlug("sf tech")).toBe(false);
    expect(isValidSlug("年表")).toBe(false);
    expect(isValidSlug("a".repeat(51))).toBe(false);
    expect(isValidSlug("a".repeat(50))).toBe(true);
  });
});

describe("normalizeSlug", () => {
  it("trims and lowercases", () => {
    expect(normalizeSlug("  SF-Tech  ")).toBe("sf-tech");
  });
});

describe("slugError", () => {
  it("returns null for valid input", () => {
    expect(slugError("sf-tech-lifeline")).toBeNull();
    expect(slugError(" SF-Tech ")).toBeNull();
  });

  it("explains why input was rejected", () => {
    expect(slugError("")).toMatch(/入力/);
    expect(slugError("-new")).toMatch(/英数字で始め/);
    expect(slugError("年表")).toMatch(/英数字で始め/);
    expect(slugError("sf_tech")).toMatch(/ハイフン/);
    expect(slugError("a".repeat(51))).toMatch(/50 文字/);
  });
});
