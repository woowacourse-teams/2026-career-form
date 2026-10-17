import { describe, expect, it } from "vitest";
import { AnalysisContractError } from "./validate-response";
import type { InteractionDecisionRequest } from "./interaction-types";
import { validateInteractionDecisionResponse } from "./validate-interaction-response";

const request: InteractionDecisionRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-1",
  site: { host: "example.test", pathPattern: "/" },
  decisions: [
    {
      decisionId: "decision-1",
      role: "SEARCH_QUERY_INPUT",
      canonicalFieldKey: "education.university.schoolName",
      candidates: [
        {
          candidateId: "candidate-1",
          element: "input",
          control: "text",
          visibility: "visible",
          relationToTarget: "DIALOG_CONTROL",
        },
      ],
    },
  ],
};

const complete = (decision: object) => ({
  schemaVersion: 2,
  snapshotId: "snapshot-1",
  status: "COMPLETE",
  mode: "GENERIC",
  decisions: [decision],
});

describe("interaction decision response validation", () => {
  it("accepts unavailable statuses only with their empty decision contracts", () => {
    expect(
      validateInteractionDecisionResponse(request, {
        schemaVersion: 2,
        snapshotId: "snapshot-1",
        status: "LLM_UNAVAILABLE",
        mode: "GENERIC",
        decisions: [],
      }),
    ).toMatchObject({ status: "LLM_UNAVAILABLE" });
    expect(() =>
      validateInteractionDecisionResponse(request, {
        schemaVersion: 2,
        snapshotId: "snapshot-1",
        status: "POLICY_UNAVAILABLE",
        mode: "GENERIC",
        decisions: [],
      }),
    ).toThrow(AnalysisContractError);
  });

  it("accepts abstention without a candidate id", () => {
    expect(
      validateInteractionDecisionResponse(
        request,
        complete({
          decisionId: "decision-1",
          role: "SEARCH_QUERY_INPUT",
          selection: "ABSTAINED",
          candidateId: null,
        }),
      ),
    ).toMatchObject({ status: "COMPLETE" });
  });

  it.each([
    { selection: "SELECTED", candidateId: "missing" },
    {
      selection: "SELECTED",
      candidateId: "candidate-1",
      role: "SEARCH_SUBMIT",
    },
    { selection: "ABSTAINED", candidateId: "candidate-1" },
  ])("rejects invalid or unsafe selections", (decision) => {
    expect(() =>
      validateInteractionDecisionResponse(
        request,
        complete({
          decisionId: "decision-1",
          role: "SEARCH_QUERY_INPUT",
          ...decision,
        }),
      ),
    ).toThrow(AnalysisContractError);
  });

  it("rejects duplicate decisions, extra keys, and snapshot mismatches", () => {
    expect(() =>
      validateInteractionDecisionResponse(request, {
        ...complete({
          decisionId: "decision-1",
          role: "SEARCH_QUERY_INPUT",
          selection: "ABSTAINED",
        }),
        decisions: [
          {
            decisionId: "decision-1",
            role: "SEARCH_QUERY_INPUT",
            selection: "ABSTAINED",
          },
          {
            decisionId: "decision-1",
            role: "SEARCH_QUERY_INPUT",
            selection: "ABSTAINED",
          },
        ],
      }),
    ).toThrow(AnalysisContractError);
    expect(() =>
      validateInteractionDecisionResponse(request, {
        ...complete({
          decisionId: "decision-1",
          role: "SEARCH_QUERY_INPUT",
          selection: "ABSTAINED",
        }),
        extra: true,
      }),
    ).toThrow(AnalysisContractError);
    expect(() =>
      validateInteractionDecisionResponse(request, {
        ...complete({
          decisionId: "decision-1",
          role: "SEARCH_QUERY_INPUT",
          selection: "ABSTAINED",
        }),
        snapshotId: "other",
      }),
    ).toThrow(AnalysisContractError);
  });
});

const structureRequest: InteractionDecisionRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-1",
  site: { host: "example.test", pathPattern: "/" },
  decisions: [
    {
      decisionId: "addRow",
      role: "REPEAT_ADD",
      canonicalFieldKey: "careers.career.companyName",
      candidates: [
        {
          candidateId: "addButton",
          element: "button",
          control: "button",
          visibility: "visible",
          relationToTarget: "SAME_CONTAINER",
        },
        {
          candidateId: "addSubmit",
          element: "input",
          control: "submit",
          visibility: "visible",
          relationToTarget: "SAME_CONTAINER",
        },
        {
          candidateId: "addOption",
          element: "select",
          control: "option",
          visibility: "visible",
          relationToTarget: "SAME_CONTAINER",
        },
      ],
    },
    {
      decisionId: "reveal",
      role: "SECTION_REVEAL",
      canonicalFieldKey: "careers.career.companyName",
      candidates: [
        {
          candidateId: "revealLink",
          element: "link",
          control: "button",
          visibility: "visible",
          relationToTarget: "SAME_CONTAINER",
        },
        {
          candidateId: "revealSelectButton",
          element: "select",
          control: "button",
          visibility: "visible",
          relationToTarget: "SAME_CONTAINER",
        },
      ],
    },
    {
      decisionId: "kindMaster",
      role: "ROW_KIND_OPTION",
      targetKind: "MASTER",
      canonicalFieldKey: "education.graduateSchool.schoolName",
      candidates: [
        {
          candidateId: "optMaster",
          element: "select",
          control: "option",
          visibility: "visible",
          relationToTarget: "SAME_REPEAT_ROW",
        },
        {
          candidateId: "optHidden",
          element: "select",
          control: "option",
          visibility: "hidden",
          relationToTarget: "SAME_REPEAT_ROW",
        },
        {
          candidateId: "kindButton",
          element: "button",
          control: "button",
          visibility: "visible",
          relationToTarget: "SAME_REPEAT_ROW",
        },
        {
          candidateId: "kindSelectControl",
          element: "select",
          control: "button",
          visibility: "visible",
          relationToTarget: "SAME_REPEAT_ROW",
        },
      ],
    },
    {
      decisionId: "query",
      role: "SEARCH_QUERY_INPUT",
      canonicalFieldKey: "education.university.schoolName",
      candidates: [
        {
          candidateId: "queryInput",
          element: "input",
          control: "text",
          visibility: "visible",
          relationToTarget: "DIALOG_CONTROL",
        },
        {
          candidateId: "querySelect",
          element: "select",
          control: "text",
          visibility: "visible",
          relationToTarget: "DIALOG_CONTROL",
        },
        {
          candidateId: "queryOption",
          element: "input",
          control: "option",
          visibility: "visible",
          relationToTarget: "DIALOG_CONTROL",
        },
      ],
    },
  ],
};

const structureResponse = (selections: Record<string, string | null>) => ({
  schemaVersion: 2,
  snapshotId: "snapshot-1",
  status: "COMPLETE",
  mode: "GENERIC",
  decisions: structureRequest.decisions.map((decision) => {
    const candidateId = selections[decision.decisionId] ?? null;
    return {
      decisionId: decision.decisionId,
      role: decision.role,
      selection: candidateId ? "SELECTED" : "ABSTAINED",
      candidateId,
    };
  }),
});

describe("structure role response validation", () => {
  it("accepts visible buttons for repeat/reveal and a visible select option for row kind", () => {
    expect(
      validateInteractionDecisionResponse(
        structureRequest,
        structureResponse({
          addRow: "addButton",
          reveal: "revealLink",
          kindMaster: "optMaster",
          query: "queryInput",
        }),
      ),
    ).toMatchObject({ status: "COMPLETE" });
  });

  it.each([
    ["repeat add selecting a non-button control", { addRow: "addSubmit" }],
    ["repeat add selecting a select option", { addRow: "addOption" }],
    [
      "section reveal selecting a select element",
      { reveal: "revealSelectButton" },
    ],
    ["row kind selecting a button", { kindMaster: "kindButton" }],
    [
      "row kind selecting a select without option control",
      { kindMaster: "kindSelectControl" },
    ],
    ["row kind selecting a hidden option", { kindMaster: "optHidden" }],
    ["row kind selecting an unknown candidate", { kindMaster: "optMissing" }],
    ["another role selecting a select element", { query: "querySelect" }],
    ["another role selecting an option control", { query: "queryOption" }],
  ])("rejects %s", (_name, selections) => {
    expect(() =>
      validateInteractionDecisionResponse(
        structureRequest,
        structureResponse(selections),
      ),
    ).toThrow(AnalysisContractError);
  });
});
