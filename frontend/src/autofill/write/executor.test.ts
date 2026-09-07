import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { CandidateBlockReason } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
} from "./executor";

afterEach(() => {
  document.body.replaceChildren();
  setPageUrl("http://localhost:3000");
});

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

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
  it("writes a locally resolved derived binding value", () => {
    const input = document.createElement("input");
    const registry = register(input, {
      candidateId: "field-derived",
      element: "input",
      control: "text",
      visibility: "visible",
    });
    const analysis: MatchedFieldAnalysis = {
      candidateId: "field-derived",
      matchType: "MATCH",
      valueBinding: {
        type: "DERIVED",
        recipe: "KOREAN_FULL_NAME",
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "김민수")],
      approvedCandidateIds: new Set(["field-derived"]),
      registry,
    });

    expect(input.value).toBe("김민수");
    expect(result).toEqual([
      { candidateId: "field-derived", status: "written" },
    ]);
  });

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

  it("writes a readonly text field only for an adapter-verified write plan", () => {
    const input = document.createElement("input");
    input.readOnly = true;
    const registry = register(input, {
      candidateId: "field-1",
      element: "input",
      control: "text",
      visibility: "visible",
      readonly: true,
    });
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      mappingStatus: "ADAPTER_VERIFIED",
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "비식별 주소")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(input.value).toBe("비식별 주소");
    expect(result).toEqual([{ candidateId: "field-1", status: "written" }]);
  });

  it("writes the exact values retained by review for repeated profile entries", () => {
    const first = document.createElement("input");
    const second = document.createElement("input");
    document.body.append(first, second);
    const registry = new CandidateRegistry();
    for (const [index, element] of [first, second].entries()) {
      const candidateId = `field-${index + 1}`;
      registry.registerField({
        kind: "field",
        candidateId,
        candidate: {
          candidateId,
          element: "input",
          control: "text",
          visibility: "visible",
        },
        elements: [element],
        optionElements: new Map(),
        sectionId: "section-certificate",
        itemId: `certificate-item-${index + 1}`,
        itemIndex: index,
        signature: createStructuralSignature([element]),
      });
    }

    executeApprovedWrites({
      items: [
        reviewItem({ ...textAnalysis, candidateId: "field-1" }, "자격증 A", {
          profileEntryId: "certificate-1",
        }),
        reviewItem({ ...textAnalysis, candidateId: "field-2" }, "자격증 B", {
          profileEntryId: "certificate-2",
        }),
      ],
      approvedCandidateIds: new Set(["field-1", "field-2"]),
      registry,
    });

    expect(first.value).toBe("자격증 A");
    expect(second.value).toBe("자격증 B");
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

  it("reapplies an approved select after a queued page reset", async () => {
    const select = document.createElement("select");
    const professionalCollege = new Option("전문대학(전문학사)", "associate");
    const university = new Option("대학(학사)", "bachelor");
    select.append(professionalCollege, university);
    const schoolName = document.createElement("input");
    schoolName.addEventListener("change", () => {
      window.setTimeout(() => {
        select.value = professionalCollege.value;
        schoolName.value = "";
      }, 0);
    });
    document.body.append(select, schoolName);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "education-type",
      candidate: {
        candidateId: "education-type",
        element: "select",
        control: "select",
        visibility: "visible",
        options: [
          { optionId: "associate", displayName: "전문대학(전문학사)" },
          { optionId: "bachelor", displayName: "대학(학사)" },
        ],
      },
      elements: [select],
      optionElements: new Map([
        ["associate", professionalCollege],
        ["bachelor", university],
      ]),
      sectionId: "section-education",
      signature: createStructuralSignature([select]),
    });
    registry.registerField({
      kind: "field",
      candidateId: "school-name",
      candidate: {
        candidateId: "school-name",
        element: "input",
        control: "text",
        visibility: "visible",
      },
      elements: [schoolName],
      optionElements: new Map(),
      sectionId: "section-education",
      signature: createStructuralSignature([schoolName]),
    });
    const selectAnalysis: MatchedFieldAnalysis = {
      candidateId: "education-type",
      matchType: "MATCH",
      valueBinding: {
        type: "LOOKUP",
        profileFieldKey: "education.university.degreeLevel",
        optionMap: { 학사: "대학(학사)" },
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    };

    const result = await executeApprovedWritesAfterPageSettles({
      items: [
        reviewItem(selectAnalysis, "대학(학사)"),
        reviewItem({ ...textAnalysis, candidateId: "school-name" }, "대학교"),
      ],
      approvedCandidateIds: new Set(["education-type", "school-name"]),
      registry,
    });

    expect(select.value).toBe("bachelor");
    expect(schoolName.value).toBe("대학교");
    expect(result).toEqual([
      { candidateId: "education-type", status: "written" },
      { candidateId: "school-name", status: "written" },
    ]);
  });

  it("selects the university bachelor option when only its parentheses differ", () => {
    const select = document.createElement("select");
    const professionalCollege = new Option("전문대학(학사)", "college");
    const university = new Option("대학교(학사)", "university");
    select.append(professionalCollege, university);
    const registry = register(
      select,
      {
        candidateId: "education-type",
        element: "select",
        control: "select",
        visibility: "visible",
        options: [
          { optionId: "college", displayName: "전문대학(학사)" },
          { optionId: "university", displayName: "대학교(학사)" },
        ],
      },
      new Map([
        ["college", professionalCollege],
        ["university", university],
      ]),
    );
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      candidateId: "education-type",
      writePlan: { command: "SELECT_OPTION" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "대학교 학사")],
      approvedCandidateIds: new Set(["education-type"]),
      registry,
    });

    expect(select.value).toBe("university");
    expect(result).toEqual([
      { candidateId: "education-type", status: "written" },
    ]);
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

  it("does not guess different radio labels without a backend-derived value", () => {
    const no = Object.assign(document.createElement("input"), {
      type: "radio",
      value: "N",
    });
    const yes = Object.assign(document.createElement("input"), {
      type: "radio",
      value: "Y",
    });
    document.body.append(no, yes);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "disability-status",
      candidate: {
        candidateId: "disability-status",
        element: "input",
        control: "radio",
        visibility: "visible",
        options: [
          { optionId: "no", displayName: "비대상" },
          { optionId: "yes", displayName: "대상" },
        ],
      },
      elements: [no, yes],
      optionElements: new Map([
        ["no", no],
        ["yes", yes],
      ]),
      sectionId: "section-1",
      signature: createStructuralSignature([no, yes]),
    });
    const result = executeApprovedWrites({
      items: [
        reviewItem(
          {
            ...textAnalysis,
            candidateId: "disability-status",
            writePlan: { command: "CHECK_RADIO" },
          },
          "예",
        ),
      ],
      approvedCandidateIds: new Set(["disability-status"]),
      registry,
    });

    expect(yes.checked).toBe(false);
    expect(result).toEqual([
      {
        candidateId: "disability-status",
        status: "skipped",
        reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
      },
    ]);
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

  it("selects a Hyundai-style button menu only when the verified code and label match", () => {
    setPageUrl("https://talent.hyundai.com/apply/applyWrite.hc");
    const trigger = document.createElement("input");
    trigger.type = "button";
    const option = document.createElement("button");
    option.dataset.code = "003";
    option.textContent = "대리";
    Object.defineProperty(option, "offsetParent", { value: document.body });
    trigger.addEventListener("click", () => document.body.append(option));
    option.addEventListener("click", () => {
      trigger.value = "대리";
    });
    const registry = register(trigger, {
      candidateId: "career-position",
      element: "input",
      control: "button",
      visibility: "visible",
    });
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      candidateId: "career-position",
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey: "careers.career.position",
        optionMap: { 대리: "대리" },
        optionCodeMap: { 대리: "003" },
      },
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    };

    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "대리")],
      approvedCandidateIds: new Set(["career-position"]),
      registry,
    });

    expect(trigger.value).toBe("대리");
    expect(result).toEqual([
      { candidateId: "career-position", status: "written" },
    ]);
  });

  it("does not open a company button menu on an unsupported host", () => {
    const trigger = document.createElement("input");
    trigger.type = "button";
    let opened = false;
    trigger.addEventListener("click", () => {
      opened = true;
    });
    const registry = register(trigger, {
      candidateId: "field-1",
      element: "input",
      control: "button",
      visibility: "visible",
    });
    const analysis: MatchedFieldAnalysis = {
      ...textAnalysis,
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey: "careers.career.position",
        optionMap: { 대리: "대리" },
        optionCodeMap: { 대리: "003" },
      },
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    };
    const result = executeApprovedWrites({
      items: [reviewItem(analysis, "대리")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });
    expect(opened).toBe(false);
    expect(trigger.value).toBe("");
    expect(result[0]?.status).toBe("skipped");
  });

  it.each([0, 2])(
    "does not select or fall back when a company menu has %i matching choices",
    (count) => {
      setPageUrl("https://talent.hyundai.com/apply/applyWrite.hc");
      const trigger = document.createElement("input");
      trigger.type = "button";
      trigger.value = "기존 표시";
      let selected = 0;
      trigger.addEventListener("click", () => {
        for (let index = 0; index < count; index += 1) {
          const option = document.createElement("button");
          option.dataset.code = "003";
          option.textContent = "대리";
          Object.defineProperty(option, "offsetParent", {
            value: document.body,
          });
          option.addEventListener("click", () => {
            selected += 1;
          });
          document.body.append(option);
        }
      });
      const registry = register(trigger, {
        candidateId: "field-1",
        element: "input",
        control: "button",
        visibility: "visible",
      });
      const analysis: MatchedFieldAnalysis = {
        ...textAnalysis,
        valueBinding: {
          type: "BUTTON_OPTION",
          profileFieldKey: "careers.career.position",
          optionMap: { 대리: "대리" },
          optionCodeMap: { 대리: "003" },
        },
        writePlan: { command: "SELECT_BUTTON_OPTION" },
      };
      const result = executeApprovedWrites({
        items: [reviewItem(analysis, "대리")],
        approvedCandidateIds: new Set(["field-1"]),
        registry,
      });
      expect(result[0]?.status).toBe("skipped");
      expect(selected).toBe(0);
      expect(trigger.value).toBe("기존 표시");
    },
  );

  it.each(["unapproved", "stale"])(
    "does not open a company menu for a %s candidate",
    (state) => {
      setPageUrl("https://talent.hyundai.com/apply/applyWrite.hc");
      const trigger = document.createElement("input");
      trigger.type = "button";
      let opened = false;
      trigger.addEventListener("click", () => {
        opened = true;
      });
      const registry = register(trigger, {
        candidateId: "field-1",
        element: "input",
        control: "button",
        visibility: "visible",
      });
      if (state === "stale") trigger.remove();
      const analysis: MatchedFieldAnalysis = {
        ...textAnalysis,
        valueBinding: {
          type: "BUTTON_OPTION",
          profileFieldKey: "careers.career.position",
          optionMap: { 대리: "대리" },
          optionCodeMap: { 대리: "003" },
        },
        writePlan: { command: "SELECT_BUTTON_OPTION" },
      };
      const result = executeApprovedWrites({
        items: [reviewItem(analysis, "대리")],
        approvedCandidateIds: new Set(state === "stale" ? ["field-1"] : []),
        registry,
      });
      expect(result[0]?.status).toBe("skipped");
      expect(opened).toBe(false);
    },
  );

  it.each([
    ["https://talent.hyundai.com/apply/applyWrite.hc", true],
    ["https://example.test/apply", false],
  ])(
    "synchronizes successful text labels only for the owning company: %s",
    (url, expected) => {
      setPageUrl(url);
      const input = document.createElement("input");
      const registry = register(input, {
        candidateId: "field-1",
        element: "input",
        control: "text",
        visibility: "visible",
      });
      const field = document.createElement("div");
      field.className = "field";
      document.body.append(field);
      field.append(input);
      const result = executeApprovedWrites({
        items: [reviewItem(textAnalysis, "fixture")],
        approvedCandidateIds: new Set(["field-1"]),
        registry,
      });
      expect(result[0]?.status).toBe("written");
      expect(input.value).toBe("fixture");
      expect(field.classList.contains("exist")).toBe(expected);
    },
  );
});
