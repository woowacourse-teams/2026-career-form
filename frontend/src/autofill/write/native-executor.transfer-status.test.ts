import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => document.body.replaceChildren());

const KEY = "education.university.transferStatus";

describe("a select naming admission instead of the stored transfer status", () => {
  it("writes the admission option for the stored non-transfer value", async () => {
    document.body.innerHTML =
      '<select id="admission"><option>선택</option><option>입학</option><option>편입</option></select>';
    const select = document.querySelector<HTMLSelectElement>("#admission")!;
    const optionElements = new Map(
      ["선택", "입학", "편입"].map((name, index) => [
        `o${index}`,
        select.options[index]!,
      ]),
    );
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "select",
        control: "select",
        visibility: "visible",
        options: ["선택", "입학", "편입"].map((displayName, index) => ({
          optionId: `o${index}`,
          displayName,
        })),
      },
      elements: [select],
      optionElements,
      sectionId: "section-1",
      signature: createStructuralSignature([select]),
    });
    const analysis: MatchedFieldAnalysis = {
      candidateId: "field-1",
      matchType: "MATCH",
      profileFieldKey: KEY,
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    };
    const entry: ReviewPlanItem = {
      candidateId: "field-1",
      fieldLabel: "입학 구분",
      profileFieldKey: KEY,
      currentValue: "선택",
      profileValue: "비해당",
      previewValue: "비해당",
      status: "available",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "테스트",
      analysis,
    };
    const [result] = await executeApprovedWritesAfterPageSettles({
      items: [entry],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });
    expect(result).toMatchObject({ status: "written" });
    expect(select.options[select.selectedIndex]!.text).toBe("입학");
  });
});
