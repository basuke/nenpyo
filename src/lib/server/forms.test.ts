import { describe, expect, it } from "vitest";
import { formatLinksInput, parseEntryForm, parseLinksInput, parseTimelineForm } from "./forms";

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("parseTimelineForm", () => {
  it("accepts a title and slug, trimming whitespace", () => {
    const result = parseTimelineForm(formData({ title: "  年表  ", slug: " SF-Tech ", description: "" }));
    expect(result).toEqual({
      ok: true,
      value: { slug: "sf-tech", title: "年表", description: null },
    });
  });

  it("requires a title", () => {
    expect(parseTimelineForm(formData({ title: "  ", slug: "x" }))).toMatchObject({ ok: false });
  });

  it("reports the slug problem rather than a generic failure", () => {
    const result = parseTimelineForm(formData({ title: "年表", slug: "-nope" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/英数字で始め/);
  });
});

describe("parseEntryForm", () => {
  const base = { year: "1974", title: "日本沈没 映画公開" };

  it("takes year and title, leaving optional fields null", () => {
    const result = parseEntryForm(formData(base));
    expect(result).toEqual({
      ok: true,
      value: {
        year: 1974,
        title: "日本沈没 映画公開",
        tagline: null,
        body: null,
        category: null,
        subcategory: null,
        links: null,
      },
    });
  });

  it("keeps the tagline separate from the title so a reading never becomes a fact", () => {
    const result = parseEntryForm(formData({ ...base, tagline: " 沈む国を先に見た ", body: "説明" }));
    expect(result).toMatchObject({
      ok: true,
      value: { title: "日本沈没 映画公開", tagline: "沈む国を先に見た", body: "説明" },
    });
  });

  it("rejects an over-long tagline", () => {
    const result = parseEntryForm(formData({ ...base, tagline: "あ".repeat(101) }));
    expect(result).toMatchObject({ ok: false });
    expect(parseEntryForm(formData({ ...base, tagline: "あ".repeat(100) }))).toMatchObject({ ok: true });
  });

  it("accepts years before the common era", () => {
    const result = parseEntryForm(formData({ ...base, year: "-300" }));
    expect(result).toMatchObject({ ok: true, value: { year: -300 } });
  });

  it("rejects a missing, fractional, or out-of-range year", () => {
    expect(parseEntryForm(formData({ ...base, year: "" }))).toMatchObject({ ok: false });
    expect(parseEntryForm(formData({ ...base, year: "1974.5" }))).toMatchObject({ ok: false });
    expect(parseEntryForm(formData({ ...base, year: "99999" }))).toMatchObject({ ok: false });
    expect(parseEntryForm(formData({ ...base, year: "むかし" }))).toMatchObject({ ok: false });
  });
});

describe("links input", () => {
  it("stores one link per line as a JSON array", () => {
    expect(parseLinksInput("階差機関\n  en:Analytical Engine  \n\n")).toBe(
      '["階差機関","en:Analytical Engine"]',
    );
  });

  it("stores nothing when the field is blank", () => {
    expect(parseLinksInput("")).toBeNull();
    expect(parseLinksInput("\n  \n")).toBeNull();
  });

  it("round-trips back into the textarea", () => {
    const stored = parseLinksInput("階差機関\nen:Analytical Engine");
    expect(formatLinksInput(stored)).toBe("階差機関\nen:Analytical Engine");
  });

  it("survives broken or non-array JSON", () => {
    expect(formatLinksInput(null)).toBe("");
    expect(formatLinksInput("{oops")).toBe("");
    expect(formatLinksInput('{"a":1}')).toBe("");
    expect(formatLinksInput('["ok", 42]')).toBe("ok");
  });
});
