import { describe, expect, it } from "vitest";
import type { MatchedFieldAnalysis, PreparationPlan } from "../../api/types";
import { getWorkflowAdapter } from "../workflow";

const adapter = getWorkflowAdapter("www.skcareers.com");
const majorSelection = adapter.revealSelections[0]!;

function radioDocument(name: string, label = "있음"): Document {
  const page = document.implementation.createHTMLDocument("fixture");
  page.body.innerHTML = `<label><input type="radio" name="${name}" /> ${label}</label>`;
  return page;
}

describe("SK conditional selections", () => {
  it.each([
    "eduMajorDoubleYN",
    "eduMajorDoubleYN_12345678-1234-abcd-1234-123456789abc",
  ])("selects the supported exact or UUID radio name %s", (name) => {
    const page = radioDocument(name);
    expect(adapter.selectReveal(page, majorSelection, " 있음 ")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    expect(page.querySelector("input")!.checked).toBe(true);
  });

  it.each([
    "eduMajorDoubleYN_wrong",
    "eduMajorDoubleYNSuffix",
    "eduMajorDoubleYN_12345678-1234-abcd-1234-123456789abz",
  ])("does not click a similar but unverified name %s", (name) => {
    const page = radioDocument(name);
    expect(adapter.selectReveal(page, majorSelection, "있음")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
    expect(page.querySelector("input")!.checked).toBe(false);
  });

  it.each([undefined, "없음", "PRIVATE_PROFILE_SENTINEL"])(
    "returns value-free diagnostics without selecting when the profile condition is absent (%s)",
    (value) => {
      const page = radioDocument("eduMajorDoubleYN");
      const diagnostic = adapter.selectReveal(page, majorSelection, value);
      expect(diagnostic).toEqual({
        code:
          value === undefined ? "PROFILE_UNAVAILABLE" : "PROFILE_NOT_SELECTED",
        count: 1,
      });
      expect(page.querySelector("input")!.checked).toBe(false);
      expect(JSON.stringify(diagnostic)).not.toContain(
        "PRIVATE_PROFILE_SENTINEL",
      );
    },
  );

  it("reports a failed selection when the radio cannot be clicked", () => {
    const page = radioDocument("eduMajorDoubleYN");
    page.querySelector("input")!.disabled = true;
    expect(adapter.selectReveal(page, majorSelection, "있음")).toEqual({
      code: "SELECTION_FAILED",
      count: 1,
    });
  });

  it("requires the exact visible option label", () => {
    const page = radioDocument("eduMajorDoubleYN", "있음 (기타)");
    expect(adapter.selectReveal(page, majorSelection, "있음").code).toBe(
      "TARGET_MISSING",
    );
    expect(page.querySelector("input")!.checked).toBe(false);
  });
});

const bindingPlan: PreparationPlan = {
  actionCandidateId: "reveal-major",
  command: "SELECT_OPTION_TO_REVEAL",
  expectedEffect: "TARGET_FIELDS_VISIBLE",
  targetSectionId: "education",
  profileFieldKey: "education.university.doubleMajorStatus",
  revealedFieldBindings: {
    eduMajorDouble: "education.university.additionalMajorName",
    eduMajorSub: "education.university.minorName",
  },
};
const field: MatchedFieldAnalysis = {
  candidateId: "major",
  matchType: "MATCH",
  autofillPolicy: "ALLOWED",
  mappingStatus: "ADAPTER_VERIFIED",
  interactionStatus: "READY",
  valueBinding: {
    type: "DIRECT",
    profileFieldKey: "education.university.additionalMajorName",
  },
  writePlan: { command: "SET_TEXT" },
};

describe("revealed field binding selection", () => {
  it("matches only the exact policy-provided DOM and profile binding", () => {
    const bindings = adapter.revealedBindings([bindingPlan]);
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorDouble", bindings),
    ).toBe("education.university.additionalMajorName");
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorSub", bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorDouble_extra", bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(field, undefined, bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(
        { ...field, writePlan: { command: "SELECT_OPTION" } },
        "eduMajorDouble",
        bindings,
      ),
    ).toBeUndefined();
  });

  it.each([
    "talent.hyundai.com",
    "careers.example.test",
    "skcareers.com.example.test",
  ])("does not apply SK preparation rules on %s", (host) => {
    const other = getWorkflowAdapter(host);
    expect(other.revealSelections).toEqual([]);
    expect(other.revealedBindings([bindingPlan]).size).toBe(0);
    expect(
      other.revealedProfileFieldKey(
        field,
        "eduMajorDouble",
        adapter.revealedBindings([bindingPlan]),
      ),
    ).toBeUndefined();
    expect(other.isFreshRowDefault("eduEducationType")).toBe(false);
    expect(
      other.hasFreshRows([
        {
          plan: {
            actionCandidateId: "add",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["eduEducationName"],
          },
          currentGroupCount: 0,
          requiredAdditions: 1,
        },
      ]),
    ).toBe(false);
  });
});

describe("SK education action section hints", () => {
  it.each([
    ["btnAddEducationGrad", "graduateSchool"],
    ["btnAddEducationHigh", "highSchool"],
    ["btnAddEducationUniv", "university"],
    ["educationuniv educationhigh educationgrad", "graduateSchool"],
    ["educationuniv educationhigh", "highSchool"],
    ["학력 추가", undefined],
  ] as const)(
    "resolves %s using the existing section priority",
    (label, expected) => {
      expect(adapter.educationSectionHint?.(label)).toBe(expected);
    },
  );
});
