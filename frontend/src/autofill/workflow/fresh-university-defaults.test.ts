import { describe, expect, it } from "vitest";

import {
  hasFreshUniversityRows,
  isLanguageTypeStateDriver,
  shouldRunRevealPlan,
} from "./AutofillWorkflow";
import type { ReviewPlanItem } from "../review/review-plan";

describe("hasFreshUniversityRows", () => {
  it("recognizes a university row that this run adds to an empty form", () => {
    expect(
      hasFreshUniversityRows([
        {
          plan: {
            actionCandidateId: "add-university",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["eduEducationName"],
          },
          currentGroupCount: 0,
          requiredAdditions: 1,
        },
      ]),
    ).toBe(true);
  });

  it("does not treat a pre-existing university row as a fresh default", () => {
    expect(
      hasFreshUniversityRows([
        {
          plan: {
            actionCandidateId: "add-university",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["eduEducationName"],
          },
          currentGroupCount: 1,
          requiredAdditions: 1,
        },
      ]),
    ).toBe(false);
  });
});

describe("shouldRunRevealPlan", () => {
  it("does not open a conditional detail field for a false profile selection", () => {
    expect(shouldRunRevealPlan("없음", "있음")).toBe(false);
  });

  it("opens a conditional detail field for its matching profile selection", () => {
    expect(shouldRunRevealPlan("있음", "있음")).toBe(true);
  });

  it("uses only policy-provided profile values for a company-specific radio label", () => {
    expect(shouldRunRevealPlan("장애", "대상", ["장애", "예", "대상"])).toBe(true);
    expect(shouldRunRevealPlan("아니오", "대상", ["장애", "예", "대상"])).toBe(false);
  });
});

describe("isLanguageTypeStateDriver", () => {
  const item = {
    candidateId: "language-type",
    fieldLabel: "외국어",
    currentValue: "",
    previewValue: "영어",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis: {
      candidateId: "language-type",
      matchType: "MATCH",
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    },
  } satisfies ReviewPlanItem;

  it("recognizes language selection as a DOM state transition", () => {
    expect(
      isLanguageTypeStateDriver(item, "lngLanguageType", "www.skcareers.com"),
    ).toBe(true);
  });

  it("does not split ordinary selects into a second analysis pass", () => {
    expect(
      isLanguageTypeStateDriver(item, "eduEducationType", "www.skcareers.com"),
    ).toBe(false);
  });

  it("does not change another company's select handling", () => {
    expect(
      isLanguageTypeStateDriver(item, "lngLanguageType", "careers.example.test"),
    ).toBe(false);
  });
});
