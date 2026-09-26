import { mockGreetingEditingCommand } from "../interaction/test-utils/greeting-email-editing";
import { afterEach, beforeEach, expect, it } from "vitest";
let restoreEditingCommand: (() => void) | undefined;
beforeEach(() => {
  restoreEditingCommand = mockGreetingEditingCommand(document);
});
afterEach(() => restoreEditingCommand?.());

import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";

import { installGreetingEmailCloseBridge } from "../interaction/greeting-email-close-bridge";
beforeEach(() => installGreetingEmailCloseBridge(document));

afterEach(() => document.body.replaceChildren());
function fixture() {
  document.body.innerHTML =
    '<div data-scope="field" data-part="root"><label>이메일주소*</label><input role="combobox" data-scope="combobox" data-part="input" aria-controls="email-options" /></div>';
  const input = document.querySelector("input")!;
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "email",
    sectionId: "s",
    elements: [input],
    optionElements: new Map(),
    signature: createStructuralSignature([input]),
    candidate: {
      candidateId: "email",
      domName: "basicInformation.email",
      element: "input",
      control: "text",
      displayName: "이메일주소",
      visibility: "visible",
    },
  } as FieldCandidateHandle);
  const item = {
    candidateId: "email",
    profileValue: "fixture@example.com",
    currentValue: "",
    status: "available",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "email",
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  } as ReviewPlanItem;
  const run = (adapter = true) =>
    executeApprovedWrites({
      items: [item],
      registry,
      approvedCandidateIds: new Set(["email"]),
      ...(adapter ? { executionAdapterId: "greeting-v1" as const } : {}),
    });
  return { input, item, run };
}
it("writes the verified Greeting free-entry email without requiring suggestion selection", () => {
  const { input, run } = fixture();
  expect(run()[0].status).toBe("written");
  expect(input.value).toBe("fixture@example.com");
});
it("keeps generic combobox selection requirements outside the Greeting adapter", () => {
  const { input, run } = fixture();
  expect(run(false)[0].status).toBe("skipped");
  expect(input.value).toBe("");
});
it.each([
  "changed label",
  "duplicate",
  "existing value",
  "unverified",
  "readonly",
])("preserves email on %s", (condition) => {
  const { input, item, run } = fixture();
  if (condition === "changed label")
    document.querySelector("label")!.textContent = "학교명";
  if (condition === "duplicate")
    document.body.append(document.querySelector("div")!.cloneNode(true));
  if (condition === "existing value") input.value = "existing@example.com";
  if (condition === "unverified")
    item.analysis!.mappingStatus = "LLM_SUGGESTED";
  if (condition === "readonly") input.readOnly = true;
  const before = input.value;
  expect(run()[0].status).toBe("skipped");
  expect(input.value).toBe(before);
});
it("does not report success when the page rejects the email value", () => {
  const { input, run } = fixture();
  input.addEventListener("input", () => {
    input.value = "";
  });
  expect(run()[0].status).toBe("skipped");
  expect(input.value).toBe("");
});

it("leaves free-entry email focused for the async acceptance check", () => {
  const { input, run } = fixture();
  let blurred = false;
  input.addEventListener("blur", () => {
    blurred = true;
  });
  expect(run()[0].status).toBe("written");
  expect(input.value).toBe("fixture@example.com");
  expect(document.activeElement).toBe(input);
  expect(blurred).toBe(false);
});
it("does not report email success when the editing event rejects the value", () => {
  const { input, run } = fixture();
  input.addEventListener("input", () => {
    input.value = "";
  });
  expect(run()[0].status).toBe("skipped");
  expect(input.value).toBe("");
});

it("preserves a value populated by the page when email receives focus", () => {
  const { input, run } = fixture();
  input.addEventListener("focus", () => {
    input.value = "existing@example.com";
  });
  expect(run()[0].status).toBe("skipped");
  expect(input.value).toBe("existing@example.com");
});
