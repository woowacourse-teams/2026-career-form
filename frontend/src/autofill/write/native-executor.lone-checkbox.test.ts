import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";
import { executeApprovedWrites } from "./native-executor";

afterEach(() => document.body.replaceChildren());

const KEY = "careers.career.employmentStatus";

/** One checkbox whose label is one choice of a select-type profile field. */
function loneCheckbox(label: string, checked = false) {
  document.body.innerHTML = `<label><input type="checkbox" id="status">${label}</label>`;
  const box = document.querySelector<HTMLInputElement>("#status")!;
  box.checked = checked;
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate: {
      candidateId: "field-1",
      element: "input",
      control: "checkbox",
      visibility: "visible",
      options: [{ optionId: "o1", displayName: label }],
    },
    elements: [box],
    optionElements: new Map([["o1", box]]),
    sectionId: "section-1",
    signature: createStructuralSignature([box]),
  });
  return { box, registry };
}

function item(profileValue: string, currentValue = ""): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId: "field-1",
    matchType: "MATCH",
    profileFieldKey: KEY,
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command: "CHECK_CHECKBOX" },
  };
  return {
    candidateId: "field-1",
    fieldLabel: "재직 여부",
    profileFieldKey: KEY,
    currentValue,
    profileValue,
    previewValue: profileValue,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  };
}

async function run(registry: CandidateRegistry, entry: ReviewPlanItem) {
  const [result] = await executeApprovedWritesAfterPageSettles({
    items: [entry],
    approvedCandidateIds: new Set(["field-1"]),
    registry,
  });
  return result;
}

describe("a lone checkbox named after one choice of the profile field", () => {
  it("treats an unchecked box as already matching another stored choice", async () => {
    const { box, registry } = loneCheckbox("재직중");
    const [before] = executeApprovedWrites({
      items: [item("퇴사")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });
    expect(before).toMatchObject({
      status: "skipped",
      outcome: "unchanged",
      code: "ALREADY_MATCHED",
    });
    // The settle check confirms the box still holds the matching state.
    expect(await run(registry, item("퇴사"))).toMatchObject({
      status: "written",
    });
    expect(box.checked).toBe(false);
  });

  it("keeps a checked box when the stored choice is another one", async () => {
    const { box, registry } = loneCheckbox("재직중", true);
    const result = await run(registry, item("퇴사", "on"));
    expect(result).toMatchObject({ status: "skipped", code: "CONFLICT" });
    expect(box.checked).toBe(true);
  });

  it("still checks the box when the stored choice is its label", async () => {
    const { box, registry } = loneCheckbox("재직중");
    const result = await run(registry, item("재직중"));
    expect(result).toMatchObject({ status: "written" });
    expect(box.checked).toBe(true);
  });

  it("stays unsupported when the stored value is not a choice of the field", async () => {
    const { box, registry } = loneCheckbox("재직중");
    const result = await run(registry, item("휴직"));
    expect(result).toMatchObject({
      status: "skipped",
      code: "UNSUPPORTED_CONTROL",
    });
    expect(box.checked).toBe(false);
  });

  it("stays unsupported when the label is not a choice of the field", async () => {
    const { box, registry } = loneCheckbox("경력 있음");
    const result = await run(registry, item("퇴사"));
    expect(result).toMatchObject({
      status: "skipped",
      code: "UNSUPPORTED_CONTROL",
    });
    expect(box.checked).toBe(false);
  });
});
