import { describe, expect, it } from "vitest";
import { majorNameKeyForText } from "./major-key";

describe("majorNameKeyForText", () => {
  it.each([
    [
      "education.university.majorField",
      "전공",
      "education.university.majorName",
    ],
    [
      "education.university.minorField",
      "부전공",
      "education.university.minorName",
    ],
    [
      "education.graduateSchool.majorField",
      "전공명",
      "education.graduateSchool.majorName",
    ],
  ])("reads %s on a plain %s text field as the name", (key, label, want) => {
    expect(majorNameKeyForText(key, "text", [label])).toBe(want);
  });

  it.each([
    ["a field label", "education.university.majorField", "text", ["전공 계열"]],
    [
      "a field label in English",
      "education.university.majorField",
      "text",
      ["Major field"],
    ],
    ["a select", "education.university.majorField", "select", ["전공"]],
    ["another key", "education.university.majorName", "text", ["전공"]],
    [
      "a label without a major word",
      "education.university.majorField",
      "text",
      ["학과 분류"],
    ],
  ] as const)("keeps the key for %s", (_name, key, control, labels) => {
    expect(majorNameKeyForText(key, control, [...labels])).toBe(key);
  });
});
