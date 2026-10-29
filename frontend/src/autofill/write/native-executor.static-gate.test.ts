import { afterEach, describe, expect, it } from "vitest";

import type { FieldCandidate, MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";

afterEach(() => {
  document.body.replaceChildren();
});

function register(
  candidate: FieldCandidate,
  elements: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[],
  options: [string, HTMLElement][],
) {
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field-1",
    candidate,
    elements,
    optionElements: new Map(options),
    sectionId: "section-1",
    signature: createStructuralSignature(elements),
  });
  return registry;
}

function adapterItem(command: "CHECK_RADIO" | "SELECT_OPTION"): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId: "field-1",
    matchType: "MATCH",
    profileFieldKey: "personal.personal.gender",
    autofillPolicy: "ALLOWED",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command },
  };
  return {
    candidateId: "field-1",
    fieldLabel: "지원서 필드",
    profileFieldKey: analysis.profileFieldKey,
    currentValue: "",
    profileValue: "예",
    previewValue: "예",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  };
}

function write(registry: CandidateRegistry, item: ReviewPlanItem) {
  return executeApprovedWrites({
    items: [item],
    registry,
    approvedCandidateIds: new Set(["field-1"]),
  })[0];
}

describe("adapter-verified writes keep their pre-generic behavior", () => {
  it("checks the radio without a second synthetic click", () => {
    document.body.innerHTML = `
      <fieldset>
        <label><input id="r-yes" type="radio" name="answer" value="Y">예</label>
        <label><input id="r-no" type="radio" name="answer" value="N">아니오</label>
      </fieldset>`;
    const yes = document.getElementById("r-yes") as HTMLInputElement;
    const no = document.getElementById("r-no") as HTMLInputElement;
    let clicks = 0;
    yes.addEventListener("click", () => {
      clicks += 1;
    });
    const registry = register(
      {
        candidateId: "field-1",
        element: "input",
        control: "radio",
        visibility: "visible",
        options: [
          { optionId: "opt-yes", displayName: "예" },
          { optionId: "opt-no", displayName: "아니오" },
        ],
      },
      [yes, no],
      [
        ["opt-yes", yes],
        ["opt-no", no],
      ],
    );

    expect(write(registry, adapterItem("CHECK_RADIO"))).toMatchObject({
      status: "written",
    });
    expect(yes.checked).toBe(true);
    expect(clicks).toBe(0);
  });

  it("selects a native option that the page styles as hidden", () => {
    document.body.innerHTML = `
      <select id="answer">
        <option value="">선택</option>
        <option id="o-yes" value="Y" style="display:none">예</option>
        <option value="N">아니오</option>
      </select>`;
    const select = document.getElementById("answer") as HTMLSelectElement;
    const yes = document.getElementById("o-yes") as HTMLOptionElement;
    const registry = register(
      {
        candidateId: "field-1",
        element: "select",
        control: "select",
        visibility: "visible",
        options: [{ optionId: "opt-yes", displayName: "예" }],
      },
      [select],
      [["opt-yes", yes]],
    );

    expect(write(registry, adapterItem("SELECT_OPTION"))).toMatchObject({
      status: "written",
    });
    expect(select.value).toBe("Y");
  });
});
