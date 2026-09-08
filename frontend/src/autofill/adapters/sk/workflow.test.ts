import { describe, expect, it } from "vitest";
import type { MatchedFieldAnalysis, PreparationPlan } from "../../api/types";
import { createStructuralSignature } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
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

function stateDriver(
  domName: string,
  profileFieldKey: string,
): { item: ReviewPlanItem; handle: FieldCandidateHandle } {
  const input = document.createElement("input");
  input.name = domName;
  const analysis: MatchedFieldAnalysis = {
    candidateId: `field-${domName}`,
    matchType: "MATCH",
    valueBinding: { type: "DIRECT", profileFieldKey },
    autofillPolicy: "CONDITIONAL",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command: "SET_TEXT" },
  };
  return {
    item: {
      candidateId: analysis.candidateId,
      fieldLabel: domName,
      profileFieldKey,
      currentValue: "",
      profileValue: "공개 테스트 값",
      previewValue: "공개 테스트 값",
      status: "available",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "fixture",
      analysis,
    },
    handle: {
      kind: "field",
      candidateId: analysis.candidateId,
      candidate: {
        candidateId: analysis.candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
        domName,
      },
      elements: [input],
      optionElements: new Map(),
      sectionId: "section",
      itemId: "item",
      itemIndex: 0,
      signature: createStructuralSignature([input]),
    },
  };
}

describe("SK autocomplete state drivers", () => {
  it.each([
    ["eduEducationName", "education.university.schoolName", 2],
    ["cerCertName", "certifications.certificate.name", 3],
    ["lngExamName", "languages.languageTest.testName", 4],
  ])(
    "runs the exact verified %s binding in its serial stage",
    (domName, fieldKey, stage) => {
      const { item, handle } = stateDriver(domName, fieldKey);
      expect(adapter.stateDriverStage?.(item, handle)).toBe(stage);
    },
  );

  it("gives the second exam row its own later write-and-settle stage", () => {
    const { item, handle } = stateDriver(
      "lngExamName",
      "languages.languageTest.testName",
    );
    expect(adapter.stateDriverStage?.(item, { ...handle, itemIndex: 1 })).toBe(
      7,
    );
  });

  it("does not treat a similar or differently bound text field as a search driver", () => {
    const { item, handle } = stateDriver(
      "lngExamNameSuffix",
      "languages.languageTest.testName",
    );
    expect(adapter.stateDriverStage?.(item, handle)).toBeUndefined();
    const exactHandle = stateDriver(
      "lngExamName",
      "languages.languageTest.grade",
    );
    expect(
      adapter.stateDriverStage?.(exactHandle.item, exactHandle.handle),
    ).toBeUndefined();
  });

  it("requires the approved direct READY text contract for a search driver", () => {
    const { item, handle } = stateDriver(
      "cerCertName",
      "certifications.certificate.name",
    );
    expect(
      adapter.stateDriverStage?.(
        {
          ...item,
          analysis: { ...item.analysis!, mappingStatus: "LLM_SUGGESTED" },
        },
        handle,
      ),
    ).toBeUndefined();
    expect(
      adapter.stateDriverStage?.(
        {
          ...item,
          analysis: {
            ...item.analysis!,
            interactionStatus: "BLOCKED",
            writePlan: undefined,
          },
        },
        handle,
      ),
    ).toBeUndefined();
  });
});
