import { describe, expect, it } from "vitest";
import { buildSearchRegexes, matchesSearch } from "./sidebarSearch";

describe("sidebarSearch", () => {
  it("空查询匹配全部", () => {
    expect(matchesSearch("任何标题", buildSearchRegexes("   "))).toBe(true);
  });
  it("不区分大小写、空白归一、多词都要命中", () => {
    const re = buildSearchRegexes("  react   HOOK ");
    expect(matchesSearch("Learn React  hooks", re)).toBe(true);
    expect(matchesSearch("Learn React", re)).toBe(false);
  });
  it("正则元字符被转义，不会抛错", () => {
    const re = buildSearchRegexes("a.b(*[");
    expect(() => matchesSearch("a.b(*[", re)).not.toThrow();
    expect(matchesSearch("a.b(*[ x", re)).toBe(true);
    expect(matchesSearch("axb", buildSearchRegexes("a.b"))).toBe(false);
  });
});
