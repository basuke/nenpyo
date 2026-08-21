import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  formatLinksInput,
  parseEntryInput,
  parseLinksInput,
  parseMergeChoice,
  parsePlacedNote,
  parseTimelineInput,
} from "./input";

/** 投げられた AppError の code を取り出す。通ってしまったら分かる形で落とす。 */
function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (cause) {
    if (cause instanceof AppError) return cause.code;
    throw cause;
  }
  throw new Error("expected the input to be rejected");
}

describe("parseTimelineInput", () => {
  it("accepts a title and slug, trimming whitespace", () => {
    expect(parseTimelineInput({ title: "  年表  ", slug: " SF-Tech ", description: "" })).toEqual({
      slug: "sf-tech",
      title: "年表",
      description: null,
    });
  });

  it("requires a title", () => {
    expect(codeOf(() => parseTimelineInput({ title: "  ", slug: "x" }))).toBe("title_required");
  });

  it("reports the slug problem rather than a generic failure", () => {
    expect(codeOf(() => parseTimelineInput({ title: "年表", slug: "-nope" }))).toBe("slug_invalid");
  });
});

describe("parseEntryInput", () => {
  const base = { year: "1974", title: "日本沈没 映画公開" };

  it("takes year and title, leaving optional fields null", () => {
    expect(parseEntryInput(base)).toEqual({
      year: 1974,
      title: "日本沈没 映画公開",
      tagline: null,
      body: null,
      category: null,
      subcategory: null,
      links: null,
    });
  });

  it("keeps the tagline separate from the title so a reading never becomes a fact", () => {
    expect(parseEntryInput({ ...base, tagline: " 沈む国を先に見た ", body: "説明" })).toMatchObject({
      title: "日本沈没 映画公開",
      tagline: "沈む国を先に見た",
      body: "説明",
    });
  });

  it("rejects an over-long tagline", () => {
    const limit = "あ".repeat(100);
    expect(codeOf(() => parseEntryInput({ ...base, tagline: limit + "あ" }))).toBe("tagline_too_long");
    expect(parseEntryInput({ ...base, tagline: limit })).toMatchObject({ tagline: limit });
  });

  it("accepts years before the common era", () => {
    expect(parseEntryInput({ ...base, year: "-300" })).toMatchObject({ year: -300 });
  });

  it("rejects a missing, fractional, or out-of-range year", () => {
    expect(codeOf(() => parseEntryInput({ ...base, year: "" }))).toBe("year_required");
    expect(codeOf(() => parseEntryInput({ ...base, year: "1974.5" }))).toBe("year_invalid");
    expect(codeOf(() => parseEntryInput({ ...base, year: "99999" }))).toBe("year_out_of_range");
    expect(codeOf(() => parseEntryInput({ ...base, year: "むかし" }))).toBe("year_invalid");
  });

  // API から来る JSON は year を数値で送ってくる。フォームの文字列と同じ結果に
  // ならなければ「同じ操作を通っている」と言えない。
  it("gives the same result whether a field arrives as a string or a number", () => {
    expect(parseEntryInput({ ...base, year: 1974 })).toEqual(parseEntryInput(base));
  });

  it("treats a missing field the same as a blank one", () => {
    expect(parseEntryInput(base).body).toBeNull();
    expect(parseEntryInput({ ...base, body: "   " }).body).toBeNull();
  });
});

describe("parseMergeChoice", () => {
  const notes = { target: 1, source: 2 };

  it("takes the note of whichever side was chosen", () => {
    expect(parseMergeChoice({ choice: "target" }, notes)).toEqual({ kind: "existing", noteId: 1 });
    expect(parseMergeChoice({ choice: "source" }, notes)).toEqual({ kind: "existing", noteId: 2 });
  });

  it("refuses to write a new note with nothing in it", () => {
    const empty = { choice: "new", tagline: " ", body: "" };
    expect(codeOf(() => parseMergeChoice(empty, notes))).toBe("note_empty");
  });

  // note_id は 1 本しか刺さらないので、既定で片方を採ると黙ってもう片方が消える。
  it("insists on a choice rather than picking a side by default", () => {
    expect(codeOf(() => parseMergeChoice({}, notes))).toBe("note_choice_required");
  });
});

describe("parsePlacedNote", () => {
  it("carries nothing over unless asked", () => {
    expect(parsePlacedNote({})).toEqual({ kind: "none" });
    expect(parsePlacedNote({ note: "share" })).toEqual({ kind: "share" });
    expect(parsePlacedNote({ note: "own", tagline: "自分の言葉" })).toEqual({
      kind: "own",
      tagline: "自分の言葉",
      body: null,
    });
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
