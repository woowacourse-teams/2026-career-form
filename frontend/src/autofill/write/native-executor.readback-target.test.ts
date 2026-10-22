import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => {
  document.body.replaceChildren();
});

const analysis: MatchedFieldAnalysis = {
  candidateId: "field-1",
  matchType: "MATCH",
  profileFieldKey: "contact.contact.email",
  autofillPolicy: "ALLOWED",
  mappingStatus: "LLM_SUGGESTED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
};

const item: ReviewPlanItem = {
  candidateId: "field-1",
  fieldLabel: "지원서 필드",
  profileFieldKey: analysis.profileFieldKey,
  currentValue: "",
  profileValue: "example",
  previewValue: "example",
  status: "available",
  selected: true,
  disabled: false,
  revealed: true,
  reason: "테스트",
  analysis,
};

function registerGroup(elements: HTMLInputElement[]) {
  document.body.append(...elements);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements,
    optionElements: new Map(),
    sectionId: "section-1",
    signature: createStructuralSignature(elements),
  });
  return registry;
}

async function run(registry: CandidateRegistry) {
  return executeApprovedWritesAfterPageSettles({
    items: [item],
    approvedCandidateIds: new Set(["field-1"]),
    registry,
  });
}

describe("settle readback target", () => {
  it("reads the writable control that was written, not an earlier visible readonly one", async () => {
    const readonlyFirst = document.createElement("input");
    readonlyFirst.readOnly = true;
    const editable = document.createElement("input");
    const [result] = await run(registerGroup([readonlyFirst, editable]));
    expect(editable.value).toBe("example");
    expect(readonlyFirst.value).toBe("");
    expect(result).toMatchObject({ status: "written" });
  });

  it("reads the written control after an earlier hidden control becomes visible", async () => {
    const hiddenFirst = document.createElement("input");
    hiddenFirst.style.display = "none";
    const editable = document.createElement("input");
    editable.addEventListener("input", () => {
      hiddenFirst.style.display = "";
    });
    const [result] = await run(registerGroup([hiddenFirst, editable]));
    expect(editable.value).toBe("example");
    expect(result).toMatchObject({ status: "written" });
  });
});
