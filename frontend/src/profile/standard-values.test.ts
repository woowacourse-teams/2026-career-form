import { expect, it } from "vitest";
import {
  ATTENDANCE_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  LANGUAGE_TEST_OPTIONS,
  SCHOOL_REGION_OPTIONS,
  isStandardValueId,
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
    label: "AL",
    aliases: ["Advanced Low"],
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

it("adds TOEIC Speaking as a separate language test option", () => {
  expect(LANGUAGE_TEST_OPTIONS).toContainEqual({
    value: "toeic-speaking",
    label: "TOEIC Speaking",
    aliases: ["토익스피킹"],
  });
  expect(LANGUAGE_TEST_OPTIONS).toContainEqual({
    value: "toeic",
    label: "TOEIC",
    aliases: ["토익"],
  });
  expect(standardValueLabel("toeic-speaking")).toBe("TOEIC Speaking");
});

const gradeIds = (testId: string) =>
  languageGradeOptions(testId).map((option) => option.value);
const gradeLabels = (testId: string) =>
  languageGradeOptions(testId).map((option) => option.label);

it("lists the nine OPIc grades from Novice Low to Advanced Low", () => {
  expect(gradeIds("opic")).toEqual([
    "opic:nl",
    "opic:nm",
    "opic:nh",
    "opic:il",
    "opic:im1",
    "opic:im2",
    "opic:im3",
    "opic:ih",
    "opic:al",
  ]);
  expect(gradeLabels("opic")).toEqual([
    "NL",
    "NM",
    "NH",
    "IL",
    "IM1",
    "IM2",
    "IM3",
    "IH",
    "AL",
  ]);
  expect(gradeIds("opic")).not.toContain("opic:ah");
});

it("lists the eleven TOEIC Speaking grades up to Advanced High", () => {
  expect(gradeLabels("toeic-speaking")).toEqual([
    "NL",
    "NM",
    "NH",
    "IL",
    "IM1",
    "IM2",
    "IM3",
    "IH",
    "AL",
    "AM",
    "AH",
  ]);
  expect(gradeIds("toeic-speaking")[10]).toBe("toeic-speaking:ah");
  expect(languageGradeOptions("toeic-speaking")[9]).toEqual({
    value: "toeic-speaking:am",
    label: "AM",
    aliases: ["Advanced Mid"],
  });
});

it.each([
  ["jlpt", ["n5", "n4", "n3", "n2", "n1"], ["N5", "N4", "N3", "N2", "N1"]],
  [
    "topik",
    ["1", "2", "3", "4", "5", "6"],
    ["1급", "2급", "3급", "4급", "5급", "6급"],
  ],
  [
    "hsk",
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    ["1급", "2급", "3급", "4급", "5급", "6급", "7급", "8급", "9급"],
  ],
  ["hskk", ["beginner", "intermediate", "advanced"], ["초급", "중급", "고급"]],
  ["delf", ["a1", "a2", "b1", "b2"], ["A1", "A2", "B1", "B2"]],
  ["dalf", ["c1", "c2"], ["C1", "C2"]],
  [
    "dele",
    ["a1", "a2", "b1", "b2", "c1", "c2"],
    ["A1", "A2", "B1", "B2", "C1", "C2"],
  ],
  [
    "goethe-zertifikat",
    ["a1", "a2", "b1", "b2", "c1", "c2"],
    ["A1", "A2", "B1", "B2", "C1", "C2"],
  ],
])("lists the %s grade table", (testId, codes, labels) => {
  expect(gradeIds(testId)).toEqual(codes.map((code) => `${testId}:${code}`));
  expect(gradeLabels(testId)).toEqual(labels);
});

it.each(["toeic", "toefl", "teps", "ielts", "g-telp", "flex", "jpt", "sjpt"])(
  "has no grade list for the score-based test %s",
  (testId) => {
    expect(languageGradeOptions(testId)).toEqual([]);
  },
);

it("resolves grade IDs to their short labels and full-name aliases", () => {
  expect(standardValueLabel("opic:il")).toBe("IL");
  expect(standardValueLabel("toeic-speaking:ah")).toBe("AH");
  expect(standardValueLabel("topik:3")).toBe("3급");
  expect(standardValueLabel("hskk:beginner")).toBe("초급");
  expect(standardValueLabel("delf:a1")).toBe("A1");
  expect(standardValueAliases("opic:im1")).toEqual([
    "IM1",
    "Intermediate Mid 1",
  ]);
  expect(standardValueAliases("toeic-speaking:am")).toEqual([
    "AM",
    "Advanced Mid",
  ]);
  expect(standardValueAliases("jlpt:n1")).toEqual(["N1"]);
  expect(isStandardValueId("goethe-zertifikat:c2")).toBe(true);
  expect(isStandardValueId("opic:ah")).toBe(false);
});
