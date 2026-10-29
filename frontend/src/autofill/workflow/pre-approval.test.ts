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
      "veteran.veteran.veteranStatus#0",
    ]);
    expect(items.find(({ key }) => key.endsWith("serviceStartDate"))).toMatchObject({
      value: "2019-01-01",
    });
  });

  it("lists a stored value whose field the first review only held hidden", () => {
    const items = appearableProfileItems(profile(), [
      item({ profileFieldKey: "military.military.militaryStatus" }),
      item({
        profileFieldKey: "military.military.serviceStartDate",
        hiddenFromReview: true,
      }),
    ]);
    expect(items.map(({ key }) => key)).toContain(
      "military.military.serviceStartDate",
    );
  });

  it("also lists categories the page had no field for in the first review", () => {
    const keys = appearableProfileItems(profile(), [
      item({ profileFieldKey: "military.military.militaryStatus" }),
    ]).map(({ key }) => key);
    expect(keys).toContain("veteran.veteran.veteranStatus");
    expect(keys).toContain("certifications.certificate.name");
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

  it("is a REVIEW-graded field the review included on its own", () => {
    expect(
      isPreApprovedItem(
        revealed({ genericGrade: "REVIEW", genericReasonCode: "NO_FIELD_CONTEXT" }),
        scope,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "a field the applicant must decide",
      {
        genericGrade: "REVIEW" as const,
        genericReasonCode: "MODERATE_CONFIDENCE" as const,
        selected: false,
      },
    ],
    ["a blocked field", { genericGrade: "BLOCKED" as const, selected: false }],
    ["a field that already holds a value", { currentValue: "2018-01-01" }],
    ["a disabled field", { disabled: true }],
    ["a field with no stored value", { profileFieldKey: "personal.personal.nationality" }],
    ["another entry of the same key", { itemIndex: 1 }],
  ])("is never %s", (_, overrides) => {
    expect(isPreApprovedItem(revealed(overrides), scope)).toBe(false);
  });

  it("is nothing when the user turned the approval off", () => {
    expect(isPreApprovedItem(revealed({}), new Set())).toBe(false);
  });
});
