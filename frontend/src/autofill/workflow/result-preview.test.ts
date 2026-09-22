import { expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { resultPreview } from "./result-preview";
import type { ReviewPlanItem } from "../review/review-plan";

it("keeps saved ambiguous entries visible without selecting one for writing", () => {
  const profile = createEmptyProfile();
  profile.education = [
    { id: "a", sectionId: "university", values: { majorName: "컴퓨터공학" } },
    { id: "b", sectionId: "university", values: { majorName: "통계학" } },
  ];
  const item: ReviewPlanItem = {
    candidateId: "major",
    fieldLabel: "전공",
    currentValue: "",
    profileFieldKey: "education.university.majorName",
    previewValue: "입력 예정 값 없음",
    status: "unavailable",
    selected: false,
    disabled: true,
    revealed: false,
    reason: "반복 항목 확인 필요",
  };
  expect(resultPreview(item, profile)).toEqual(["컴퓨터공학", "통계학"]);
  expect(item.selected).toBe(false);
  expect(item.profileValue).toBeUndefined();
});

it("masks saved sensitive values even when the field is unavailable", () => {
  const profile = createEmptyProfile();
  profile.compensation.desiredSalary = "5000";
  expect(
    resultPreview(
      {
        candidateId: "salary",
        fieldLabel: "희망연봉",
        currentValue: "",
        profileFieldKey: "compensation.compensation.desiredSalary",
        previewValue: "입력 예정 값 없음",
        status: "unavailable",
        selected: false,
        disabled: true,
        revealed: false,
        reason: "선택 불가",
      },
      profile,
    ),
  ).toEqual(["••••••••"]);
});
