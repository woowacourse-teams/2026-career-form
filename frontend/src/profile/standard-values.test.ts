import { expect, it } from "vitest";
import {
  ATTENDANCE_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  LANGUAGE_TEST_OPTIONS,
  SCHOOL_REGION_OPTIONS,
  languageGradeOptions,
  standardValueAliases,
  standardValueLabel,
} from "./standard-values";

it("provides canonical standard values for language and education fields", () => {
  expect(LANGUAGE_OPTIONS).toEqual(
    expect.arrayContaining([
      { value: "language:en", label: "영어" },
      { value: "language:ja", label: "일본어" },
    ]),
  );
  expect(LANGUAGE_TEST_OPTIONS).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: "toeic", label: "TOEIC" }),
      { value: "opic", label: "OPIc", aliases: ["OPIC", "오픽"] },
    ]),
  );
  expect(SCHOOL_REGION_OPTIONS).toEqual(
    expect.arrayContaining([
      { value: "region:seoul", label: "서울" },
      { value: "region:overseas", label: "해외" },
    ]),
  );
  expect(ATTENDANCE_TYPE_OPTIONS).toEqual([
    { value: "attendance:day", label: "주간" },
    { value: "attendance:night", label: "야간" },
  ]);
});

it("provides stable OPIc level IDs with aliases for site options", () => {
  expect(languageGradeOptions("opic")).toContainEqual({
    value: "opic:al",
    label: "Advanced Low",
    aliases: ["AL"],
  });
  expect(standardValueAliases("opic:al")).toEqual(
    expect.arrayContaining(["Advanced Low", "AL"]),
  );
  expect(standardValueLabel("language:en")).toBe("영어");
});

it("recognizes the five profile select IDs and their approved labels", () => {
  expect(standardValueLabel("military-status:served")).toBe("군필");
  expect(standardValueLabel("military-branch:army")).toBe("육군");
  expect(standardValueLabel("military-rank:byeongjang")).toBe("병장");
  expect(standardValueLabel("veteran-status:eligible")).toBe("대상");
  expect(standardValueLabel("disability-status:eligible")).toBe("대상");
  expect(standardValueAliases("military-status:served")).toEqual(
    expect.arrayContaining(["군필", "만기전역"]),
  );
  expect(standardValueAliases("veteran-status:eligible")).toEqual(
    expect.arrayContaining(["대상", "예", "해당", "있음", "Y", "yes", "true"]),
  );
  expect(standardValueAliases("disability-status:not-eligible")).toEqual(
    expect.arrayContaining([
      "비대상",
      "아니오",
      "비해당",
      "비장애",
      "N",
      "no",
      "false",
    ]),
  );
});
