import { describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  appearableProfileItems,
  isPreApprovedItem,
  preApprovalScope,
} from "./pre-approval";

function item(overrides: Partial<ReviewPlanItem>): ReviewPlanItem {
  return {
    candidateId: "c",
    fieldLabel: "칸",
    currentValue: "",
    previewValue: "값",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    genericGrade: "AUTO",
    ...overrides,
  };
}

function profile(): Profile {
  return {
    ...createEmptyProfile(),
    military: {
      militaryStatus: "군필",
      serviceStartDate: "2019-01-01",
    },
    veteran: { veteranStatus: "대상" },
    certifications: [
      { id: "a", sectionId: "certificate", values: { name: "가", grade: "1급" } },
      { id: "b", sectionId: "certificate", values: { name: "나" } },
    ],
  };
}

describe("fields a reviewed area may reveal", () => {
  it("lists stored values of reviewed categories that no visible field covers", () => {
    const items = appearableProfileItems(profile(), [
      item({ profileFieldKey: "military.military.militaryStatus" }),
      item({ profileFieldKey: "certifications.certificate.name", itemIndex: 0 }),
    ]);
    expect(items.map(({ key, itemIndex }) => `${key}#${itemIndex}`)).toEqual([
      "certifications.certificate.grade#0",
      "certifications.certificate.name#1",
      "military.military.serviceStartDate#0",
    ]);
    expect(items.find(({ key }) => key.endsWith("serviceStartDate"))).toMatchObject({
      value: "2019-01-01",
    });
  });

  it("leaves out categories the review never showed", () => {
    const keys = appearableProfileItems(profile(), [
      item({ profileFieldKey: "military.military.militaryStatus" }),
    ]).map(({ key }) => key);
    expect(keys.some((key) => key.startsWith("veteran."))).toBe(false);
    expect(keys.some((key) => key.startsWith("certifications."))).toBe(false);
  });
});

describe("a revealed field written without a second review", () => {
  const scope = preApprovalScope(
    appearableProfileItems(profile(), [
      item({ profileFieldKey: "military.military.militaryStatus" }),
    ]),
  );
  const revealed = (overrides: Partial<ReviewPlanItem>) =>
    item({
      profileFieldKey: "military.military.serviceStartDate",
      ...overrides,
    });

  it("is an empty, AUTO-graded field inside the approved scope", () => {
    expect(isPreApprovedItem(revealed({}), scope)).toBe(true);
  });

  it.each([
    ["a field the review must confirm", { genericGrade: "REVIEW" as const }],
    ["a field that already holds a value", { currentValue: "2018-01-01" }],
    ["a disabled field", { disabled: true }],
    ["a field outside the scope", { profileFieldKey: "veteran.veteran.veteranStatus" }],
    ["another entry of the same key", { itemIndex: 1 }],
  ])("is never %s", (_, overrides) => {
    expect(isPreApprovedItem(revealed(overrides), scope)).toBe(false);
  });

  it("is nothing when the user turned the approval off", () => {
    expect(isPreApprovedItem(revealed({}), new Set())).toBe(false);
  });
});
