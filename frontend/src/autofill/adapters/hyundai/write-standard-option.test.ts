import { afterEach, describe, expect, it } from "vitest";

import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { hyundaiWriteAdapter } from "./write";

afterEach(() => document.body.replaceChildren());

function menuHandle(labels: readonly { label: string; code: string }[]) {
  const wrap = document.createElement("div");
  wrap.className = "select-wrap";
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.className = "js-field";
  const trigger = document.createElement("input");
  trigger.type = "button";
  const options = document.createElement("div");
  options.className = "select-option";
  labels.forEach(({ label, code }) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.dataset.code = code;
    choice.textContent = label;
    Object.defineProperty(choice, "offsetParent", { value: wrap });
    choice.addEventListener("click", () => {
      trigger.value = label;
      hidden.value = code;
    });
    options.append(choice);
  });
  wrap.append(hidden, trigger, options);
  document.body.append(wrap);
  return {
    trigger,
    hidden,
    handle: {
      kind: "field",
      candidateId: "exam",
      candidate: {
        candidateId: "exam",
        element: "input",
        control: "button",
        visibility: "visible",
        domId: "foreExamCd_1",
      },
      elements: [trigger],
      optionElements: new Map(),
      sectionId: "language",
      signature: "INPUT|button|foreExamCd_1|",
    } satisfies FieldCandidateHandle,
  };
}

function canonicalOpicItem(): ReviewPlanItem {
  return {
    candidateId: "exam",
    fieldLabel: "시험명",
    currentValue: "",
    profileValue: "opic",
    previewValue: "OPIc",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: "exam",
      matchType: "MATCH",
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey: "languages.languageTest.testName",
        optionMap: { OPIc: "OPIC" },
        optionCodeMap: { OPIC: "stale-code" },
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    },
  };
}

describe("Hyundai live button option writer", () => {
  it("uses the single current menu code instead of the policy code map", () => {
    const { handle, trigger, hidden } = menuHandle([
      { label: "OPIC", code: "16" },
    ]);

    expect(hyundaiWriteAdapter.tryWrite(handle, canonicalOpicItem())).toEqual({
      handled: true,
      written: true,
    });
    expect(trigger.value).toBe("OPIC");
    expect(hidden.value).toBe("16");
  });

  it("does not choose when two current menu labels match one standard value", () => {
    const { handle, trigger, hidden } = menuHandle([
      { label: "OPIC", code: "16" },
      { label: "OPIc", code: "99" },
    ]);

    expect(hyundaiWriteAdapter.tryWrite(handle, canonicalOpicItem())).toEqual({
      handled: true,
      written: false,
    });
    expect(trigger.value).toBe("");
    expect(hidden.value).toBe("");
  });
});
