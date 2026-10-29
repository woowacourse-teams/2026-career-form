import { describe, expect, it } from "vitest";
import { gpaScaleKeyForCredits } from "./scale-key";

const score = ["education.university.gpaScore"];

describe("gpaScaleKeyForCredits", () => {
  it.each(["총점", "만점", "Scale"])(
    "reads credits on a %s field beside a GPA score as the scale",
    (label) => {
      expect(
        gpaScaleKeyForCredits(
          "education.university.totalCredits",
          [label],
          score,
        ),
      ).toBe("education.university.gpaScale");
    },
  );

  it.each([
    ["a credits label", ["총 이수학점"], score],
    ["no GPA score in the section", ["총점"], []],
    [
      "a GPA score of another record",
      ["총점"],
      ["education.graduateSchool.gpaScore"],
    ],
  ] as const)("keeps the key for %s", (_name, labels, siblings) => {
    expect(
      gpaScaleKeyForCredits(
        "education.university.totalCredits",
        [...labels],
        [...siblings],
      ),
    ).toBe("education.university.totalCredits");
  });

  it("keeps other keys", () => {
    expect(
      gpaScaleKeyForCredits("education.university.gpaScore", ["총점"], score),
    ).toBe("education.university.gpaScore");
  });
});
