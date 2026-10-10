import { describe, expect, it } from "vitest";
import { getInteractive, getInteractivesForSection } from "./registry";

describe("subject interactive catalog lookup", () => {
  it("keeps known ids, optional missing lookup and one stable component identity", () => {
    const entry = getInteractive("ch04-4.4-cov-matrix-demo");
    expect(entry).toMatchObject({ subjectId: "probability", chapterId: "ch04", sectionId: "4.4" });
    expect(getInteractive(entry?.id)?.Component).toBe(entry?.Component);
    expect(getInteractive(null)).toBeUndefined();
    expect(getInteractive("missing-interactive")).toBeUndefined();
  });

  it("filters on all three location fields across the catalog boundary", () => {
    const entries = getInteractivesForSection("probability", "ch04", "4.4");
    expect(entries.map(entry => entry.id)).toEqual(["ch04-4.4-cov-matrix-demo"]);
    expect(getInteractivesForSection("chemistry", "ch04", "4.4")).toEqual([]);
    expect(getInteractivesForSection("probability", "ch03", "4.4")).toEqual([]);
    expect(getInteractivesForSection("probability", "ch04", "4.3")).not.toContainEqual(entries[0]);
  });
});
