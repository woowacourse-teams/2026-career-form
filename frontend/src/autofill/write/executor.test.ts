import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { CandidateBlockReason } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./executor";

afterEach(() => {
  document.body.replaceChildren();
});

const textAnalysis: MatchedFieldAnalysis = {
  candidateId: "field-1",
  matchType: "MATCH",
  profileFieldKey: "contact.contact.email",
  autofillPolicy: "ALLOWED",
  mappingStatus: "LLM_SUGGESTED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
};

const nonWritableCases = [
  ["not explicitly approved", { selected: true }, new Set<string>()],
  ["not selectable", { selected: true, disabled: true }, new Set(["field-1"])],
  ["not selected", { selected: false }, new Set(["field-1"])],
  [
    "an unresolved conflict",
    { status: "conflict", selected: false },
    new Set(["field-1"]),
  ],
  [
    "an unrevealed sensitive field",
    { status: "sensitive", selected: false, disabled: true, revealed: false },
    new Set(["field-1"]),
  ],
] satisfies ReadonlyArray<[string, Partial<ReviewPlanItem>, Set<string>]>;

function reviewItem(
  analysis: MatchedFieldAnalysis,
  profileValue: string,
  overrides: Partial<ReviewPlanItem> = {},
): ReviewPlanItem {
  return {
    candidateId: analysis.candidateId,
    fieldLabel: "지원서 필드",
    profileFieldKey: analysis.profileFieldKey,
    currentValue: "",
    profileValue,
    previewValue: profileValue,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
    ...overrides,
  };
}

function register(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  candidate: FieldCandidateHandle["candidate"],
  optionElements = new Map<string, HTMLOptionElement | HTMLInputElement>(),
  blockedReason?: CandidateBlockReason,
) {
  document.body.append(element);
  const registry = new CandidateRegistry();
  registry.registerField(
    {
      kind: "field",
      candidateId: candidate.candidateId,
      candidate,
      elements: [element],
      optionElements,
      sectionId: "section-1",
      signature: createStructuralSignature([element]),
    },
    blockedReason,
  );
  return registry;
}

describe("approved native-control writes", () => {
  it("writes selected and explicitly approved text through native events", () => {
    const input = document.createElement("input");
    input.type = "email";
    const registry = register(input, {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
    });
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    const result = executeApprovedWrites({
      items: [reviewItem(textAnalysis, "me@example.test")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(input.value).toBe("me@example.test");
    expect(events).toEqual(["input", "change"]);
    expect(result).toEqual([{ candidateId: "field-1", status: "written" }]);
  });

  it("selects an option only when the local profile value exactly matches its normalized display name", () => {
    const select = document.createElement("select");
    const placeholder = new Option("선택", "");
    const target = new Option("대한   민국", "kr");
    select.append(placeholder, target);
    const registry = register(
      select,
      {
        candidateId: "field-1",
        element: "select",
        control: "select",
        visibility: "visible",
        options: [
          { optionId: "option-1", displayName: "선택" },
          { optionId: "option-2", displayName: "대한 민국" },
        ],
      },
      new Map([
        ["option-1", placeholder],
        ["option-2", target],
      ]),
    );
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      writePlan: { command: "SELECT_OPTION" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "대한 민국")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(select.value).toBe("kr");
    expect(result).toEqual([{ candidateId: "field-1", status: "written" }]);
  });

  it("checks a radio by the locally resolved option display name", () => {
    const first = document.createElement("input");
    first.type = "radio";
    first.name = "gender";
    first.value = "F";
    const target = document.createElement("input");
    target.type = "radio";
    target.name = "gender";
    target.value = "M";
    document.body.append(first, target);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "input",
        control: "radio",
        visibility: "visible",
        options: [
          { optionId: "option-1", displayName: "여성" },
          { optionId: "option-2", displayName: "남성" },
        ],
      },
      elements: [first, target],
      optionElements: new Map([
        ["option-1", first],
        ["option-2", target],
      ]),
      sectionId: "section-1",
      signature: createStructuralSignature([first, target]),
    });
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      writePlan: { command: "CHECK_RADIO" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "남성")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(first.checked).toBe(false);
    expect(target.checked).toBe(true);
    expect(result).toEqual([{ candidateId: "field-1", status: "written" }]);
  });

  it("checks the matching checkbox without clearing another local choice", () => {
    const existing = document.createElement("input");
    existing.type = "checkbox";
    existing.name = "skills";
    existing.checked = true;
    const target = document.createElement("input");
    target.type = "checkbox";
    target.name = "skills";
    document.body.append(existing, target);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "input",
        control: "checkbox",
        visibility: "visible",
        options: [
          { optionId: "option-1", displayName: "Java" },
          { optionId: "option-2", displayName: "TypeScript" },
        ],
      },
      elements: [existing, target],
      optionElements: new Map([
        ["option-1", existing],
        ["option-2", target],
      ]),
      sectionId: "section-1",
      signature: createStructuralSignature([existing, target]),
    });
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      writePlan: { command: "CHECK_CHECKBOX" },
    };

    executeApprovedWrites({
      items: [reviewItem(analysis, "TypeScript")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(existing.checked).toBe(true);
    expect(target.checked).toBe(true);
  });

  it("writes a revealed sensitive field only after it is selected and approved", () => {
    const input = document.createElement("input");
    const registry = register(input, {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
    });
    const sensitiveAnalysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      autofillPolicy: "SENSITIVE_CONFIRMATION",
    };

    const result = executeApprovedWrites({
      items: [
        reviewItem(sensitiveAnalysis, "복무 완료", {
          status: "sensitive",
          selected: true,
          disabled: false,
          revealed: true,
        }),
      ],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(input.value).toBe("복무 완료");
    expect(result[0]?.status).toBe("written");
  });

  it.each(nonWritableCases)(
    "does not write %s",
    (_name, overrides, approvedCandidateIds) => {
      const input = document.createElement("input");
      const registry = register(input, {
        candidateId: "field-1",
        element: "input",
        control: "text",
        visibility: "visible",
      });

      const result = executeApprovedWrites({
        items: [reviewItem(textAnalysis, "me@example.test", overrides)],
        approvedCandidateIds,
        registry,
      });

      expect(input.value).toBe("");
      expect(result[0]?.status).toBe("skipped");
    },
  );

  it.each(["blocked", "stale"] as const)(
    "does not write a %s candidate",
    (registryState) => {
      const input = document.createElement("input");
      if (registryState === "blocked") input.disabled = true;
      const registry = register(
        input,
        {
          candidateId: "field-1",
          element: "input",
          control: "text",
          visibility: "visible",
        },
        undefined,
        registryState === "blocked" ? "disabled" : undefined,
      );
      if (registryState === "stale") input.id = "changed-after-analysis";

      const result = executeApprovedWrites({
        items: [reviewItem(textAnalysis, "me@example.test")],
        approvedCandidateIds: new Set(["field-1"]),
        registry,
      });

      expect(input.value).toBe("");
      expect(result[0]?.status).toBe("skipped");
    },
  );

  it.each([
    ["disabled", (input: HTMLInputElement) => (input.disabled = true)],
    ["readonly", (input: HTMLInputElement) => (input.readOnly = true)],
    ["hidden", (input: HTMLInputElement) => (input.hidden = true)],
    ["inert", (input: HTMLInputElement) => input.setAttribute("inert", "")],
  ])(
    "does not write when the host makes a collected field %s before final approval",
    (_state, changeHostState) => {
      const input = document.createElement("input");
      const registry = register(input, {
        candidateId: "field-1",
        element: "input",
        control: "text",
        visibility: "visible",
      });
      changeHostState(input);

      const result = executeApprovedWrites({
        items: [reviewItem(textAnalysis, "me@example.test")],
        approvedCandidateIds: new Set(["field-1"]),
        registry,
      });

      expect(input.value).toBe("");
      expect(result[0]).toMatchObject({ status: "skipped" });
    },
  );

  it("does not select a radio option the host disabled after collection", () => {
    const first = document.createElement("input");
    first.type = "radio";
    first.name = "gender";
    const target = document.createElement("input");
    target.type = "radio";
    target.name = "gender";
    document.body.append(first, target);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "input",
        control: "radio",
        visibility: "visible",
        options: [
          { optionId: "option-1", displayName: "여성" },
          { optionId: "option-2", displayName: "남성" },
        ],
      },
      elements: [first, target],
      optionElements: new Map([
        ["option-1", first],
        ["option-2", target],
      ]),
      sectionId: "section-1",
      signature: createStructuralSignature([first, target]),
    });
    target.disabled = true;

    const result = executeApprovedWrites({
      items: [
        reviewItem(
          { ...textAnalysis, writePlan: { command: "CHECK_RADIO" } },
          "남성",
        ),
      ],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(target.checked).toBe(false);
    expect(result[0]).toMatchObject({ status: "skipped" });
  });

  it("does not write when a control command does not match its native control", () => {
    const input = document.createElement("input");
    input.type = "file";
    const registry = register(input, {
      candidateId: "field-1",
      element: "input",
      control: "custom",
      visibility: "visible",
    });
    const unsupported: MatchedFieldAnalysis = {
      ...textAnalysis,
      writePlan: { command: "SET_TEXT" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(unsupported, "ignored")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(input.files).toHaveLength(0);
    expect(result[0]?.status).toBe("skipped");
  });
});
