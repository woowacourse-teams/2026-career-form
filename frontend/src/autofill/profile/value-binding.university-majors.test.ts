import { expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { DerivedRecipe } from "../api/types";
import { resolveValueBinding } from "./value-binding";

it.each([
  [
    { doubleMajorStatus: "있음", additionalMajorName: " 전산학 " },
    ["전산학", "복수전공"],
  ],
  [{ minorStatus: "있음", minorName: "통계학" }, ["통계학", "부전공"]],
  [
    {
      doubleMajorStatus: "있음",
      additionalMajorName: "전산학",
      minorStatus: "있음",
      minorName: "통계학",
    },
    ["전산학", "복수전공", "통계학", "부전공"],
  ],
  [{ doubleMajorStatus: "없음", minorStatus: "없음" }, []],
  [{ doubleMajorStatus: "있음", minorStatus: "있음", minorName: "통계학" }, []],
  [
    {
      doubleMajorStatus: "없음",
      additionalMajorName: "잔여값",
      minorStatus: "있음",
      minorName: "통계학",
    },
    [],
  ],
  [{ minorName: "플래그없음" }, []],
])(
  "resolves compact additional major slots without fabricating empty rows: %j",
  (values, expected) => {
    const profile = createEmptyProfile();
    profile.education.push({ id: "school", sectionId: "university", values });
    [
      "UNIVERSITY_ADDITIONAL_MAJOR_1_NAME",
      "UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION",
      "UNIVERSITY_ADDITIONAL_MAJOR_2_NAME",
      "UNIVERSITY_ADDITIONAL_MAJOR_2_CLASSIFICATION",
    ].forEach((recipe, index) => {
      const result = resolveValueBinding(
        profile,
        { type: "DERIVED", recipe: recipe as DerivedRecipe },
        0,
      );
      expect(result).toMatchObject(
        expected[index]
          ? {
              status: "resolved",
              value: expected[index],
              profileEntryId: "school",
            }
          : { status: "missing" },
      );
    });
  },
);
it("requires a unique university or explicit matching row", () => {
  const profile = createEmptyProfile();
  profile.education.push(
    {
      id: "a",
      sectionId: "university",
      values: { minorStatus: "있음", minorName: "통계학" },
    },
    {
      id: "b",
      sectionId: "university",
      values: { doubleMajorStatus: "있음", additionalMajorName: "전산학" },
    },
  );
  const binding = {
    type: "DERIVED" as const,
    recipe: "UNIVERSITY_ADDITIONAL_MAJOR_1_NAME" as DerivedRecipe,
  };
  expect(resolveValueBinding(profile, binding)).toMatchObject({
    status: "ambiguous",
  });
  expect(resolveValueBinding(profile, binding, 1)).toMatchObject({
    status: "resolved",
    value: "전산학",
    profileEntryId: "b",
  });
  expect(resolveValueBinding(profile, binding, 2)).toMatchObject({
    status: "missing",
  });
});
