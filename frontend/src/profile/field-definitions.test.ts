import { describe, expect, it } from "vitest";
import { PROFILE_CATEGORIES } from "./field-definitions";

describe("university profile fields", () => {
  it("includes transfer, major status, GPA scale, and latest education fields", () => {
    const university = PROFILE_CATEGORIES.find((c) => c.id === "education")?.sections.find((s) => s.id === "university");
    expect(university?.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      "transferStatus", "doubleMajorStatus", "minorStatus", "gpaScale", "gpaScore",
    ]));
    expect(PROFILE_CATEGORIES.find((c) => c.id === "education")?.topLevelFields?.map((field) => field.id))
      .toContain("latestEducationType");
    expect(university?.fields.find((field) => field.id === "transferStatus")?.inputType).toBe("select");
  });
});
