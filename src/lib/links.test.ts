import { describe, expect, it } from "vitest";
import { parseLink, parseLinks } from "./links";

describe("parseLink", () => {
  it("treats a bare string as a Japanese Wikipedia article", () => {
    expect(parseLink("階差機関")).toEqual({
      href: "https://ja.wikipedia.org/wiki/%E9%9A%8E%E5%B7%AE%E6%A9%9F%E9%96%A2",
      label: "階差機関",
      wikipedia: "ja",
    });
  });

  it("honours an en: prefix and turns spaces into underscores", () => {
    expect(parseLink("en:Analytical Engine")).toEqual({
      href: "https://en.wikipedia.org/wiki/Analytical_Engine",
      label: "Analytical Engine",
      wikipedia: "en",
    });
  });

  it("uses the label after a pipe", () => {
    const link = parseLink("交響曲第9番 (ベートーヴェン)|第九");
    expect(link?.label).toBe("第九");
    expect(link?.wikipedia).toBe("ja");
  });

  it("keeps external URLs as-is", () => {
    expect(parseLink("https://fortune.com/2026/07/21/openai/|Fortune:OpenAIの説明")).toEqual({
      href: "https://fortune.com/2026/07/21/openai/",
      label: "Fortune:OpenAIの説明",
      wikipedia: null,
    });
  });

  it("falls back to the hostname for an unlabelled external URL", () => {
    expect(parseLink("https://www.techno-edge.net/article/5045.html")?.label).toBe(
      "www.techno-edge.net",
    );
  });

  it("rejects empty input", () => {
    expect(parseLink("")).toBeNull();
    expect(parseLink("   ")).toBeNull();
    expect(parseLink("|表示名だけ")).toBeNull();
  });

  it("does not mistake a colon inside a title for a language prefix", () => {
    // 2 〜 3 文字の英小文字だけが言語プレフィックス。
    expect(parseLink("PC-6601:歌うパソコン")?.wikipedia).toBe("ja");
    expect(parseLink("PC-6601:歌うパソコン")?.label).toBe("PC-6601:歌うパソコン");
  });
});

describe("parseLinks", () => {
  it("expands a JSON array from the links column", () => {
    const links = parseLinks('["階差機関", "en:Charles Babbage"]');
    expect(links.map((l) => l.wikipedia)).toEqual(["ja", "en"]);
  });

  it("returns nothing for null, broken JSON, or a non-array", () => {
    expect(parseLinks(null)).toEqual([]);
    expect(parseLinks("")).toEqual([]);
    expect(parseLinks("{oops")).toEqual([]);
    expect(parseLinks('{"a":1}')).toEqual([]);
  });

  it("skips non-string entries instead of throwing", () => {
    expect(parseLinks('["階差機関", 42, null]')).toHaveLength(1);
  });
});
