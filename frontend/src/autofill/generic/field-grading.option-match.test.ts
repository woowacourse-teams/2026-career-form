import { describe, expect, it } from "vitest";
import { gradeGenericField, matchProfileValueOption } from "./field-grading";

const options = (...names: string[]) =>
  names.map((displayName) => ({ displayName }));
const select = (value: string, ...names: string[]) =>
  gradeGenericField({
    profileFieldKey: "certifications.certificate.grade",
    confidence: 0.9,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: "select",
    displayName: "등급",
    options: options(...names),
    optionValueCheck: { profileValue: value },
  });

describe("generic option matching in grading", () => {
  it("grades a token-set equal option as fillable", () => {
    expect(select("우수 등급", "선택", "등급 우수", "보통 등급")).toEqual({
      grade: "AUTO",
    });
  });

  it("returns the page option text for a token-set equal option", () => {
    expect(
      matchProfileValueOption(
        "certifications.certificate.grade",
        "우수 등급",
        options("선택", "등급, 우수", "보통 등급"),
      ),
    ).toBe("등급, 우수");
  });

  it("never auto-fills a containment-only option", () => {
    expect(select("우수", "선택", "우수 등급", "보통 등급")).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });

  it("keeps an ambiguous token-set match blocked", () => {
    expect(select("우수 등급", "등급 우수", "우수, 등급")).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });

  it("keeps a value that names no option blocked", () => {
    expect(select("우수", "보통 등급", "미흡 등급")).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });
});
