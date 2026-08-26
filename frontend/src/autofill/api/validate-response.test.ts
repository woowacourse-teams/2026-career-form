import { describe, expect, it } from "vitest";

import type { FieldsAnalyzeRequest, PreparationAnalyzeRequest } from "./types";
import {
  AnalysisContractError,
  validateFieldsResponse,
  validatePreparationResponse,
} from "./validate-response";

const preparationRequest: PreparationAnalyzeRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-a",
  site: { host: "example.test", pathPattern: "/apply" },
  sections: [
    {
      sectionId: "section-1",
      displayName: "학력",
      actionCandidates: [
        {
          candidateId: "action-1",
          element: "button",
          control: "button",
          visibility: "visible",
          displayName: "추가",
        },
      ],
    },
  ],
};

const fieldsRequest: FieldsAnalyzeRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-b",
  site: { host: "example.test", pathPattern: "/apply" },
  sections: [
    {
      sectionId: "section-1",
      displayName: "연락처",
      fields: [
        {
          candidateId: "field-1",
          element: "input",
          control: "text",
          visibility: "visible",
          displayName: "이메일",
        },
      ],
    },
  ],
};

const twoFieldsRequest: FieldsAnalyzeRequest = {
  ...fieldsRequest,
  sections: [
    {
      ...fieldsRequest.sections[0]!,
      fields: [
        ...fieldsRequest.sections[0]!.fields,
        {
          candidateId: "field-2",
          element: "input",
          control: "text",
          visibility: "visible",
          displayName: "전화번호",
        },
      ],
    },
  ],
};

describe("analysis API response validation", () => {
  it("accepts a preparation plan that targets a candidate from the same snapshot", () => {
    const result = validatePreparationResponse(preparationRequest, {
      snapshotId: "snapshot-a",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [
        {
          actionCandidateId: "action-1",
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
      ],
    });

    expect(result.preparationPlans).toHaveLength(1);
  });

  it.each([
    ["a stale snapshot", { snapshotId: "stale-snapshot" }],
    [
      "an unknown action candidate",
      {
        preparationPlans: [
          {
            actionCandidateId: "unknown",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
        ],
      },
    ],
    [
      "an invalid status and block-code combination",
      {
        analysisStatus: "COMPLETE",
        blockCode: "UNSUPPORTED_SNAPSHOT",
      },
    ],
  ])("rejects %s", (_name, override) => {
    expect(() =>
      validatePreparationResponse(preparationRequest, {
        snapshotId: "snapshot-a",
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
        ...override,
      }),
    ).toThrow(AnalysisContractError);
  });

  it("accepts a complete matched field result", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          profileFieldKey: "contact.contact.email",
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    });

    expect(result.fields[0]).toMatchObject({
      candidateId: "field-1",
      profileFieldKey: "contact.contact.email",
    });
  });

  it("rejects a COMPLETE response that omits a collected field", () => {
    expect(() =>
      validateFieldsResponse(twoFieldsRequest, {
        snapshotId: "snapshot-b",
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: "field-1",
            matchType: "NO_MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
        ],
      }),
    ).toThrow(AnalysisContractError);
  });

  it("allows a PARTIAL response to omit a collected field", () => {
    expect(
      validateFieldsResponse(twoFieldsRequest, {
        snapshotId: "snapshot-b",
        mode: "GENERIC",
        analysisStatus: "PARTIAL",
        fields: [
          {
            candidateId: "field-1",
            matchType: "NO_MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
        ],
      }).fields,
    ).toHaveLength(1);
  });

  it.each([
    [
      "an unknown field candidate",
      {
        fields: [
          {
            candidateId: "unknown",
            matchType: "NO_MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
        ],
      },
    ],
    [
      "duplicate field analyses",
      {
        fields: [
          {
            candidateId: "field-1",
            matchType: "NO_MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
          {
            candidateId: "field-1",
            matchType: "NO_MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          },
        ],
      },
    ],
    [
      "a write command that does not match the native control",
      {
        fields: [
          {
            candidateId: "field-1",
            matchType: "MATCH",
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "CHECK_CHECKBOX" },
          },
        ],
      },
    ],
    [
      "a syntactically valid but unknown canonical profile field key",
      {
        fields: [
          {
            candidateId: "field-1",
            matchType: "MATCH",
            profileFieldKey: "contact.contact.notARealField",
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
      },
    ],
    [
      "an excluded evidence document profile field key",
      {
        fields: [
          {
            candidateId: "field-1",
            matchType: "MATCH",
            profileFieldKey: "certifications.certificate.evidenceDocumentPath",
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
      },
    ],
    [
      "a blocked response with executable fields",
      {
        analysisStatus: "BLOCKED",
        blockCode: "ADAPTER_STRUCTURE_MISMATCH",
        fields: [
          {
            candidateId: "field-1",
            matchType: "MATCH",
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
      },
    ],
  ])("rejects %s without returning server data", (_name, override) => {
    expect(() =>
      validateFieldsResponse(
        fieldsRequest,
        Object.assign(
          {
            snapshotId: "snapshot-b",
            mode: "GENERIC",
            analysisStatus: "COMPLETE",
            fields: [],
          },
          override,
        ),
      ),
    ).toThrow(new AnalysisContractError());
  });
});
