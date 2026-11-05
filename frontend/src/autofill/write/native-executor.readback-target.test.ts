import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";
import { executeApprovedWrites, settledGenericResult } from "./native-executor";
import { resolveDateTargetFormat } from "../review/date-target-format";

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
  it.each(["2024-02-29", "2024/02/29", "2024.02.29", "2024-03-01"])(
    "checks date digits after site reformatting to %s",
    (readback) => {
      const input = document.createElement("input");
      input.placeholder = "Start date YYYYMMDD";
      const registry = registerGroup([input]);
      const lookup = registry.lookupField("field-1");
      if (lookup.status !== "ready") throw Error("missing target");
      const resolved = resolveDateTargetFormat(lookup.handle);
      if (resolved.status !== "resolved") throw Error(resolved.reason);
      const dateItem = {
        ...item,
        profileValue: "20240229",
        dateApproval: resolved.approval,
      };
      input.addEventListener("input", () => {
        input.value = readback;
      });
      const [result] = executeApprovedWrites({
        items: [dateItem],
        registry,
        approvedCandidateIds: new Set(["field-1"]),
      });
      expect(result.status).toBe(readback === "2024-03-01" ? "skipped" : "written");
      expect(settledGenericResult(dateItem, registry).status).toBe(
        readback === "2024-03-01" ? "skipped" : "written",
      );
    },
  );
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
