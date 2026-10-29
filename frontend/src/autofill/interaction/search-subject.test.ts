import { describe, expect, it } from "vitest";

import { sharesSearchSubject } from "./search-surface-dom";

describe("search subject shared by a field and its search layer", () => {
  it.each([
    ["자격명", "자격명 검색"],
    ["자격증명", "자격증 검색"],
    ["면허명", "자격/면허 검색"],
  ])("links %s to %s in generic recovery", (field, surface) => {
    expect(sharesSearchSubject(field, surface, true)).toBe(true);
  });

  it("keeps the static route on its own certificate vocabulary", () => {
    expect(sharesSearchSubject("자격명", "자격명 검색", false)).toBe(false);
  });

  it("does not link a certificate field to a school search", () => {
    expect(sharesSearchSubject("자격명", "학교 검색", true)).toBe(false);
  });
});
