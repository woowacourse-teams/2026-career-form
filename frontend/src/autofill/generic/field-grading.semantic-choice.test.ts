import { describe, expect, it } from "vitest";
import { gradeGenericField, matchProfileValueOption } from "./field-grading";

const options = (...names: string[]) => names.map((displayName) => ({ displayName }));
const grade = (key: string, value: string, names: string[]) =>
  gradeGenericField({
    profileFieldKey: key,
    confidence: 0.9,
    categoryConfirmed: true,
    hasProfileValue: true,
    control: "select",
    displayName: "선택",
    options: options(...names),
    optionValueCheck: { profileValue: value },
  });

describe("field-aware semantic choices", () => {
  it.each([
    ["veteran.veteran.veteranStatus", "veteran-status:eligible", ["해당", "비해당"], "해당"],
    ["disability.disability.disabilityStatus", "disability-status:not-eligible", ["예", "해당없음"], "해당없음"],
    ["personal.personal.gender", "남성", ["M", "F"], "M"],
    ["personal.personal.gender", "F", ["남자", "여자"], "여자"],
    ["personal.personal.nationality", "대한민국", ["내국인", "외국인"], "내국인"],
    ["personal.personal.nationality", "한국", ["국내(한국국적)", "외국인"], "국내(한국국적)"],
  ] as const)("matches %s by meaning", (key, value, names, expected) => {
    expect(matchProfileValueOption(key, value, options(...names))).toBe(expected);
    expect(grade(key, value, [...names])).toEqual({ grade: "AUTO" });
  });

  it.each([
    ["personal.personal.gender", "남성", ["남자", "M"]],
    ["veteran.veteran.veteranStatus", "대상", ["예", "해당"]],
    ["personal.personal.nationality", "한국", ["내국인", "국내", "외국인"]],
    ["personal.personal.nationality", "미입력", ["내국인", "외국인"]],
    ["personal.personal.gender", "한국", ["내국인", "외국인"]],
    ["contact.contact.addressLine1", "대상", ["예", "아니오"]],
  ] as const)("does not guess for %s", (key, value, names) => {
    expect(matchProfileValueOption(key, value, options(...names))).toBeUndefined();
  });

  it.each(["기술사", "기사", "산업기사", "기능사"])(
    "offers other for an unavailable qualification level %s only with review",
    (value) => {
      const key = "certifications.certificate.grade";
      expect(matchProfileValueOption(key, value, options("1급", "2급", "기타"))).toBe("기타");
      expect(grade(key, value, ["1급", "2급", "기타"])).toEqual({
        grade: "REVIEW", reason: "GRADE_OTHER_OPTION",
      });
      expect(grade(key, value, [value, "기타"])).toEqual({ grade: "AUTO" });
      expect(matchProfileValueOption(key, value, options("1급", "2급"))).toBeUndefined();
      expect(matchProfileValueOption(key, value, options("기타", "기타"))).toBeUndefined();
    },
  );

  it("does not substitute other for unknown grades or language scores", () => {
    expect(matchProfileValueOption("certifications.certificate.grade", "특급", options("기타"))).toBeUndefined();
    expect(matchProfileValueOption("languages.languageTest.grade", "기사", options("기타"))).toBeUndefined();
  });
});
