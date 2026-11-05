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
