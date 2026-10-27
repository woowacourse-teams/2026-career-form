import { describe, expect, it } from "vitest";
import { fixedStageKey } from "./structure-context";

const fixed = { sectionId: "highSchool" };
const selected = {
  sectionId: "highSchool",
  select: document.createElement("select"),
};

describe("fixedStageKey", () => {
  it.each([
    ["education.university.schoolName", "education.highSchool.schoolName"],
    ["education.university.schoolRegion", "education.highSchool.schoolRegion"],
    [
      "education.university.completionStatus",
      "education.highSchool.completionStatus",
    ],
  ])("reads %s on a fixed high-school row as %s", (key, want) => {
    expect(fixedStageKey(key, fixed)).toBe(want);
  });

  it.each([
    ["a field the stage lacks", "education.university.majorName", fixed],
    ["a key of the same stage", "education.highSchool.schoolName", fixed],
    ["a non-education key", "careers.career.companyName", fixed],
    ["a row bound by its select", "education.university.schoolName", selected],
    ["an unbound row", "education.university.schoolName", undefined],
  ] as const)("keeps %s", (_name, key, binding) => {
    expect(fixedStageKey(key, binding)).toBe(key);
  });
});
