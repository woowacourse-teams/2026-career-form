import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";

afterEach(() => {
  document.body.replaceChildren();
});

function run(displayName: string) {
  const input = document.createElement("input");
  document.body.append(input);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
      displayName,
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature([input]),
  });
  const analysis: MatchedFieldAnalysis = {
    candidateId: "field-1",
    matchType: "MATCH",
    profileFieldKey: "certifications.certificate.registrationNo",
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command: "SET_TEXT" },
  };
  const item: ReviewPlanItem = {
    candidateId: "field-1",
    fieldLabel: displayName,
    profileFieldKey: analysis.profileFieldKey,
    currentValue: "",
    profileValue: "A-0001",
    previewValue: "A-0001",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  };
  const [result] = executeApprovedWrites({
    items: [item],
    registry,
    approvedCandidateIds: new Set(["field-1"]),
  });
  return { result, input };
}

describe("generic forbidden-context guard", () => {
  it.each(["자격인증번호", "자격 인증 번호"])(
    "writes a certification number labelled %s",
    (label) => {
      const { result, input } = run(label);
      expect(result).toMatchObject({ status: "written" });
      expect(input.value).toBe("A-0001");
    },
  );

  it.each(["인증번호", "휴대폰 인증번호", "본인인증", "자격증 검색"])(
    "still refuses a verification or search field labelled %s",
    (label) => {
      const { result, input } = run(label);
      expect(result).toMatchObject({ status: "skipped", code: "UNSUPPORTED_CONTROL" });
      expect(input.value).toBe("");
    },
  );
});
