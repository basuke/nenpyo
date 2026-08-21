import { describe, expect, it } from "vitest";
import { bundleable, contains, type Period } from "./period";

const at = (precision: string, year: number, month?: number, day?: number): Period => ({
  year,
  month: month ?? null,
  day: day ?? null,
  hour: null,
  minute: null,
  precision,
});

describe("contains", () => {
  it("treats an identical period as contained", () => {
    expect(contains(at("year", 1998), at("year", 1998))).toBe(true);
  });

  it("lets a coarser period hold a finer one inside it", () => {
    expect(contains(at("year", 1998), at("month", 1998, 3))).toBe(true);
    expect(contains(at("decade", 1990), at("year", 1998))).toBe(true);
    expect(contains(at("century", 1900), at("year", 1998))).toBe(true);
  });

  it("does not let a finer period hold a coarser one", () => {
    expect(contains(at("month", 1998, 3), at("year", 1998))).toBe(false);
  });

  it("rejects periods that merely sit near each other", () => {
    expect(contains(at("year", 1998), at("year", 1999))).toBe(false);
    expect(contains(at("year", 1998), at("month", 1999, 3))).toBe(false);
    expect(contains(at("decade", 1990), at("year", 2001))).toBe(false);
  });

  it("rounds negative years downward, so -45 and -41 share a decade", () => {
    expect(contains(at("decade", -45), at("year", -41))).toBe(true);
    expect(contains(at("decade", -45), at("year", -39))).toBe(false);
  });

  it("falls back to year for a precision it does not know", () => {
    expect(contains(at("fortnight", 1998), at("year", 1998))).toBe(true);
  });
});

describe("bundleable", () => {
  it("accepts a single event, or none", () => {
    expect(bundleable([])).toBe(true);
    expect(bundleable([at("year", 1998)])).toBe(true);
  });

  it("accepts events that all fall inside the coarsest one", () => {
    expect(bundleable([at("year", 1998), at("year", 1998)])).toBe(true);
    expect(bundleable([at("year", 1998), at("month", 1998, 3), at("month", 1998, 5)])).toBe(true);
  });

  it("rejects siblings with no period holding both", () => {
    expect(bundleable([at("month", 1998, 3), at("month", 1998, 5)])).toBe(false);
    expect(bundleable([at("year", 1998), at("year", 1999)])).toBe(false);
  });

  it("rejects a set where one event escapes the coarsest period", () => {
    expect(bundleable([at("year", 1998), at("month", 1998, 3), at("year", 1999)])).toBe(false);
  });
});
