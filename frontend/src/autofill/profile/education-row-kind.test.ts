import { describe, expect, it } from "vitest";

import {
  kindOfEntry,
  kindOfOptionText,
  sectionOfKind,
} from "./education-row-kind";

function entry(sectionId: string, values: Record<string, string> = {}) {
  return { id: "entry-1", sectionId, values };
}

describe("sectionOfKind", () => {
  it("maps every kind to its profile section", () => {
    expect(sectionOfKind("HIGH_SCHOOL")).toBe("highSchool");
    expect(sectionOfKind("JUNIOR_COLLEGE")).toBe("university");
    expect(sectionOfKind("UNIVERSITY")).toBe("university");
    expect(sectionOfKind("MASTER")).toBe("graduateSchool");
    expect(sectionOfKind("DOCTOR")).toBe("graduateSchool");
  });
});

describe("kindOfOptionText", () => {
  it.each([
    ["고등학교", "HIGH_SCHOOL"],
    ["전문대학", "JUNIOR_COLLEGE"],
    ["전문대학(전문학사)", "JUNIOR_COLLEGE"],
    ["대학교", "UNIVERSITY"],
    ["대학(학사)", "UNIVERSITY"],
    ["대학원(석사)", "MASTER"],
    ["석사", "MASTER"],
    ["대학원(박사)", "DOCTOR"],
    ["박사", "DOCTOR"],
  ] as const)("accepts the standard text %j", (text, kind) => {
    expect(kindOfOptionText(text)).toBe(kind);
  });

  it("normalizes NFKC and whitespace before exact matching", () => {
    expect(kindOfOptionText("  대학(학사) ")).toBe("UNIVERSITY");
    expect(kindOfOptionText("전문대학 (전문학사)")).toBeUndefined();
    expect(kindOfOptionText("대학원（석사）")).toBe("MASTER");
    expect(kindOfOptionText(" 고등학교\n")).toBe("HIGH_SCHOOL");
  });

  it.each([
    "",
    "선택",
    "학력구분 선택",
    "고등학교 졸업",
    "대학",
    "4년제 대학교",
    "대학원",
    "학사",
    "대학원(석박사통합)",
    "석박사통합",
    "1|고등학교",
  ])("rejects non-standard or partial text %j", (text) => {
    expect(kindOfOptionText(text)).toBeUndefined();
  });
});

describe("kindOfEntry", () => {
  it("maps a high school entry", () => {
    expect(kindOfEntry(entry("highSchool"))).toBe("HIGH_SCHOOL");
  });

  it("prefers schoolType over degreeLevel for universities", () => {
    expect(
      kindOfEntry(
        entry("university", { schoolType: "전문대학", degreeLevel: "학사" }),
      ),
    ).toBe("JUNIOR_COLLEGE");
    expect(kindOfEntry(entry("university", { schoolType: "대학교" }))).toBe(
      "UNIVERSITY",
    );
    expect(kindOfEntry(entry("university", { degreeLevel: "전문학사" }))).toBe(
      "JUNIOR_COLLEGE",
    );
    expect(kindOfEntry(entry("university", { degreeLevel: "학사" }))).toBe(
      "UNIVERSITY",
    );
    expect(kindOfEntry(entry("university"))).toBeUndefined();
  });

  it("maps graduate degrees and leaves integrated or empty ones undefined", () => {
    expect(kindOfEntry(entry("graduateSchool", { degreeLevel: "석사" }))).toBe(
      "MASTER",
    );
    expect(kindOfEntry(entry("graduateSchool", { degreeLevel: "박사" }))).toBe(
      "DOCTOR",
    );
    expect(
      kindOfEntry(entry("graduateSchool", { degreeLevel: "석박사통합" })),
    ).toBeUndefined();
    expect(kindOfEntry(entry("graduateSchool"))).toBeUndefined();
  });

  it("returns undefined for other sections", () => {
    expect(kindOfEntry(entry("languages"))).toBeUndefined();
  });
});
