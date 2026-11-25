import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { executeApprovedWrites } from "../write/native-executor";
import { buildReviewPlan, type ReviewPlanItem } from "./review-plan";

afterEach(() => document.body.replaceChildren());

const KEY = "certifications.certificate.issuer";
const STORED = "한국산업인력공단";

function profileWith(issuer: string) {
  const profile = createEmptyProfile();
  profile.certifications = [
    { id: "certificate", sectionId: "certificate", values: { issuer } },
  ];
  return profile;
}

function textField(page: string) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = page;
  document.body.append(input);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "issuer",
    candidate: {
      candidateId: "issuer",
      displayName: "발급기관",
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section",
    signature: createStructuralSignature([input]),
  });
  return { input, registry };
}

function selectField(names: string[]) {
  const select = document.createElement("select");
  select.append(new Option("선택", ""));
  const options = names.map((displayName, index) => ({
    optionId: `o${index}`,
    displayName,
  }));
  const optionElements = new Map<string, HTMLElement>();
  options.forEach((option) => {
    const element = new Option(option.displayName, option.optionId);
    select.append(element);
    optionElements.set(option.optionId, element);
  });
  document.body.append(select);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "issuer",
    candidate: {
      candidateId: "issuer",
      displayName: "발급기관",
      element: "select",
      control: "select",
      visibility: "visible",
      options,
    },
    elements: [select],
    optionElements,
    sectionId: "section",
    signature: createStructuralSignature([select]),
  });
  return { select, registry };
}

function planFor(
  registry: CandidateRegistry,
  command: "SET_TEXT" | "SELECT_OPTION",
  stored = STORED,
) {
  return buildReviewPlan({
    profile: profileWith(stored),
    registry,
    analysis: {
      snapshotId: "test",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "issuer",
          matchType: "MATCH",
          valueBinding: { type: "DIRECT", profileFieldKey: KEY },
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command },
        },
      ],
    },
  }).items[0]!;
}

/** A reviewed text item as the executor receives it; only the mapping differs. */
function textItem(
  mappingStatus: "LLM_SUGGESTED" | "ADAPTER_VERIFIED",
  currentValue = "",
): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId: "issuer",
    matchType: "MATCH",
    valueBinding: { type: "DIRECT", profileFieldKey: KEY },
    autofillPolicy: "ALLOWED",
    mappingStatus,
    interactionStatus: "READY",
    writePlan: { command: "SET_TEXT" },
  };
  return {
    candidateId: "issuer",
    fieldLabel: "발급기관",
    profileFieldKey: KEY,
    currentValue,
    profileValue: STORED,
    previewValue: STORED,
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
    approvedCandidateIds: new Set(["issuer"]),
    registry,
  })[0]!;
}

describe("generic review of a certificate issuer already on the page", () => {
  it("does not report a site's alias of the same body as a conflict", () => {
    const { registry } = textField("산업인력공단");
    const item = planFor(registry, "SET_TEXT");
    expect(item.status).toBe("available");
    expect(item.disabled).toBe(false);
  });

  it("still reports a different body as a conflict", () => {
    const { registry } = textField("대한상공회의소");
    const item = planFor(registry, "SET_TEXT");
    expect([item.status === "available", item.selected]).toEqual([
      false,
      false,
    ]);
  });
});

describe("generic write of a certificate issuer already on the page", () => {
  it("leaves a site's alias of the same body as already matched", () => {
    const { input, registry } = textField("산업인력공단");
    expect(
      write(registry, textItem("LLM_SUGGESTED", "산업인력공단")),
    ).toMatchObject({
      status: "skipped",
      outcome: "unchanged",
      code: "ALREADY_MATCHED",
    });
    expect(input.value).toBe("산업인력공단");
  });

  it("is not a conflict when the site fills an alias after the review", () => {
    const { input, registry } = textField("HRDK");
    expect(write(registry, textItem("LLM_SUGGESTED"))).toMatchObject({
      status: "skipped",
      code: "ALREADY_MATCHED",
    });
    expect(input.value).toBe("HRDK");
  });

  it("keeps a different body as a conflict", () => {
    const { input, registry } = textField("대한상공회의소");
    expect(write(registry, textItem("LLM_SUGGESTED"))).toMatchObject({
      status: "skipped",
      code: "CONFLICT",
    });
    expect(input.value).toBe("대한상공회의소");
  });

  it("keeps the static path overwriting an alias as before", () => {
    const { input, registry } = textField("산업인력공단");
    expect(
      write(registry, textItem("ADAPTER_VERIFIED", "산업인력공단")),
    ).toEqual({
      candidateId: "issuer",
      status: "written",
    });
    expect(input.value).toBe(STORED);
  });
});

describe("generic issuer dropdown", () => {
  it("chooses the one option that names the same body", () => {
    const { select, registry } = selectField([
      "산업인력공단",
      "대한상공회의소",
    ]);
    const item = planFor(registry, "SELECT_OPTION");
    expect(item.profileValue).toBe("산업인력공단");
    const result = write(registry, { ...item, selected: true });
    expect(result.status).toBe("written");
    expect(select.selectedOptions[0]?.textContent).toBe("산업인력공단");
  });

  it("chooses nothing when two options name the same body", () => {
    const { select, registry } = selectField([
      "산업인력공단",
      "HRDK",
      "대한상공회의소",
    ]);
    const item = planFor(registry, "SELECT_OPTION");
    const result = write(registry, { ...item, selected: true });
    expect(result.status).toBe("skipped");
    expect(select.value).toBe("");
  });
});
