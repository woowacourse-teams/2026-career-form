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

const preparationRequestWithNestedAction: PreparationAnalyzeRequest = {
  ...preparationRequest,
  sections: [
    {
      ...preparationRequest.sections[0]!,
      actionCandidates: [
        ...preparationRequest.sections[0]!.actionCandidates,
        {
          candidateId: "action-2",
          element: "select",
          control: "select",
          visibility: "visible",
          displayName: "어학 종류",
          options: [
            { optionId: "option-1", displayName: "영어" },
            { optionId: "option-2", displayName: "중국어" },
          ],
        },
      ],
      items: [
        {
          itemId: "item-1",
          actionCandidates: [
            {
              candidateId: "action-3",
              element: "button",
              control: "button",
              visibility: "visible",
              displayName: "경력 추가",
            },
          ],
        },
      ],
    },
    {
      sectionId: "section-2",
      displayName: "어학 시험",
      actionCandidates: [],
    },
  ],
};

const buttonFieldsRequest: FieldsAnalyzeRequest = {
  ...fieldsRequest,
  sections: [
    {
      ...fieldsRequest.sections[0]!,
      fields: [
        {
          candidateId: "button-field",
          element: "input",
          control: "button",
          visibility: "visible",
          displayName: "직급",
        },
      ],
    },
  ],
};

const nestedFieldsRequest: FieldsAnalyzeRequest = {
  ...fieldsRequest,
  sections: [
    {
      ...fieldsRequest.sections[0]!,
      fields: [],
      items: [
        {
          itemId: "item-1",
          fields: [
            {
              candidateId: "nested-field",
              element: "input",
              control: "text",
              visibility: "visible",
              displayName: "부전공명",
            },
          ],
        },
      ],
    },
  ],
};

describe("analysis API response validation", () => {
  it("rejects site-specific metadata in the common response", () => {
    for (const extra of [
      { routingContext: "a".repeat(32) },
      { executionAdapterId: "greeting-v1" },
    ]) {
      expect(() =>
        validatePreparationResponse(preparationRequest, {
          snapshotId: "snapshot-a",
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
          ...extra,
        }),
      ).toThrow(AnalysisContractError);
    }
  });
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

  it("accepts a registered-company policy-unavailable preparation block", () => {
    const result = validatePreparationResponse(preparationRequest, {
      snapshotId: "snapshot-a",
      mode: "ADAPTER",
      analysisStatus: "BLOCKED",
      preparationPlans: [],
      blockCode: "ADAPTER_POLICY_UNAVAILABLE",
    });

    expect(result.blockCode).toBe("ADAPTER_POLICY_UNAVAILABLE");
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

  it("accepts a derived binding without receiving a profile value", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    });

    expect(result.fields[0]).toMatchObject({
      candidateId: "field-1",
      valueBinding: { type: "DERIVED", recipe: "KOREAN_FULL_NAME" },
    });
  });

  it("accepts a policy-defined option lookup without receiving a profile value", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "LOOKUP",
            profileFieldKey: "education.university.degreeLevel",
            optionMap: {
              전문학사: "전문대학(전문학사)",
              학사: "대학(학사)",
            },
          },
          autofillPolicy: "CONDITIONAL",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    });

    expect(result.fields[0]).toMatchObject({
      valueBinding: {
        type: "LOOKUP",
        profileFieldKey: "education.university.degreeLevel",
        optionMap: { 학사: "대학(학사)" },
      },
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

  it("accepts a registered-company policy-unavailable field block", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "BLOCKED",
      fields: [],
      blockCode: "ADAPTER_POLICY_UNAVAILABLE",
    });

    expect(result.blockCode).toBe("ADAPTER_POLICY_UNAVAILABLE");
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
    ).toThrow(AnalysisContractError);
  });

  it("accepts all preparation command shapes with bounded reveal metadata", () => {
    const result = validatePreparationResponse(
      preparationRequestWithNestedAction,
      {
        snapshotId: "snapshot-a",
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        warningCodes: ["MANUAL_REVEAL_REQUIRED"],
        preparationPlans: [
          {
            actionCandidateId: "action-1",
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: "section-2",
          },
          {
            actionCandidateId: "action-2",
            command: "SELECT_OPTION_TO_REVEAL",
            expectedEffect: "TARGET_FIELDS_VISIBLE",
            profileFieldKey: "languages.languageTest.language",
            optionDisplayName: "영어",
            expectedFieldNames: ["시험명", "점수"],
            selectableProfileValues: ["영어", "중국어"],
            revealedFieldBindings: {
              시험명: "languages.languageTest.testName",
              점수: "languages.languageTest.grade",
            },
            targetSectionId: "section-2",
          },
          {
            actionCandidateId: "action-3",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["회사명", "직급"],
          },
        ],
      },
    );

    expect(
      result.preparationPlans.map(({ actionCandidateId }) => actionCandidateId),
    ).toEqual(["action-1", "action-2", "action-3"]);
  });

  it.each([
    [
      "a duplicate action plan",
      [
        {
          actionCandidateId: "action-1",
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
        {
          actionCandidateId: "action-1",
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
      ],
    ],
    [
      "an unknown reveal target section",
      [
        {
          actionCandidateId: "action-1",
          command: "REVEAL_SECTION",
          expectedEffect: "TARGET_VISIBLE",
          targetSectionId: "forged-section",
        },
      ],
    ],
    [
      "a forged option id",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          optionId: "forged-option",
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "duplicate expected field names",
      [
        {
          actionCandidateId: "action-3",
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          expectedFieldNames: ["회사명", "회사명"],
        },
      ],
    ],
    [
      "an empty selectable-profile list",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          selectableProfileValues: [],
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "an empty option display name",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          optionDisplayName: "",
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "an empty expected-field list",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          expectedFieldNames: [],
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "duplicate selectable profile values",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          selectableProfileValues: ["영어", "영어"],
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "empty revealed-field bindings",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          revealedFieldBindings: {},
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "null revealed-field bindings",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          revealedFieldBindings: null,
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "a blank revealed-field binding value",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          revealedFieldBindings: { 시험명: "" },
          targetSectionId: "section-2",
        },
      ],
    ],
    [
      "a mismatched expected effect",
      [
        {
          actionCandidateId: "action-2",
          command: "SELECT_OPTION_TO_REVEAL",
          expectedEffect: "TARGET_VISIBLE",
          profileFieldKey: "languages.languageTest.language",
          targetSectionId: "section-2",
        },
      ],
    ],
  ])(
    "rejects preparation metadata containing %s",
    (_name, preparationPlans) => {
      expect(() =>
        validatePreparationResponse(preparationRequestWithNestedAction, {
          snapshotId: "snapshot-a",
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans,
        }),
      ).toThrow(AnalysisContractError);
    },
  );

  it.each([
    ["an array response", []],
    ["an empty snapshot id", { snapshotId: "" }],
    ["an unknown mode", { mode: "REMOTE" }],
    ["an unknown analysis status", { analysisStatus: "READY" }],
    ["an extra top-level property", { serverTrace: "private" }],
    ["an empty warning list", { warningCodes: [] }],
    ["an unknown warning code", { warningCodes: ["UNKNOWN_WARNING"] }],
    ["a blocked response without a block code", { analysisStatus: "BLOCKED" }],
    [
      "a blocked response with executable plans",
      {
        analysisStatus: "BLOCKED",
        blockCode: "ADAPTER_STRUCTURE_MISMATCH",
        preparationPlans: [
          {
            actionCandidateId: "action-1",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
        ],
      },
    ],
  ])("rejects preparation envelope containing %s", (_name, override) => {
    const base = {
      snapshotId: "snapshot-a",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    };
    const response = Array.isArray(override)
      ? override
      : { ...base, ...override };

    expect(() =>
      validatePreparationResponse(preparationRequest, response),
    ).toThrow(AnalysisContractError);
  });

  it("accepts a candidate nested inside a schema-2 field item", () => {
    const result = validateFieldsResponse(nestedFieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "nested-field",
          matchType: "NO_MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "BLOCKED",
          reasonCodes: ["NO_MATCH"],
        },
      ],
    });

    expect(result.fields[0]?.candidateId).toBe("nested-field");
  });

  it.each([
    [
      "a direct binding",
      fieldsRequest,
      {
        type: "DIRECT",
        profileFieldKey: "contact.contact.email",
      },
      "SET_TEXT",
    ],
    [
      "a derived boolean binding with both labels",
      fieldsRequest,
      {
        type: "DERIVED",
        recipe: "BOOLEAN_YN",
        profileFieldKey: "veteran.veteran.veteranStatus",
        trueLabel: "예",
        falseLabel: "아니오",
      },
      "SET_TEXT",
    ],
    [
      "a lookup binding",
      fieldsRequest,
      {
        type: "LOOKUP",
        profileFieldKey: "education.university.degreeLevel",
        optionMap: { 학사: "대학(학사)" },
      },
      "SET_TEXT",
    ],
    [
      "a verified text-trigger button-option binding",
      fieldsRequest,
      {
        type: "BUTTON_OPTION",
        profileFieldKey: "education.university.schoolRegion",
        optionMap: { 서울: "대한민국" },
        optionCodeMap: { 대한민국: "KR" },
      },
      "SELECT_BUTTON_OPTION",
    ],
    [
      "a verified button-option binding",
      buttonFieldsRequest,
      {
        type: "BUTTON_OPTION",
        profileFieldKey: "careers.career.position",
        optionMap: { 대리: "대리" },
        optionCodeMap: { 대리: "003" },
      },
      "SELECT_BUTTON_OPTION",
    ],
  ])(
    "accepts %s without profile values in the response",
    (_name, request, valueBinding, command) => {
      const candidateId = request.sections[0]!.fields[0]!.candidateId;
      const result = validateFieldsResponse(request, {
        snapshotId: "snapshot-b",
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId,
            matchType: "MATCH",
            valueBinding,
            autofillPolicy: "CONDITIONAL",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command },
          },
        ],
      });

      expect(result.fields[0]?.candidateId).toBe(candidateId);
    },
  );

  it.each([
    [
      "both legacy and structured bindings",
      {
        profileFieldKey: "contact.contact.email",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "contact.contact.email",
        },
      },
    ],
    ["an unknown autofill policy", { autofillPolicy: "SERVER_DECIDES" }],
    ["an unknown mapping status", { mappingStatus: "SERVER_VERIFIED" }],
    ["an unknown interaction status", { interactionStatus: "EXECUTE" }],
    ["an extra matched-field property", { rawValue: "must-never-arrive" }],
    ["no binding", { valueBinding: undefined }],
    [
      "a direct binding with an extra value",
      {
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "contact.contact.email",
          value: "must-never-arrive",
        },
      },
    ],
    [
      "an unknown derived recipe",
      { valueBinding: { type: "DERIVED", recipe: "SERVER_SCRIPT" } },
    ],
    [
      "a derived boolean binding with only one label",
      {
        valueBinding: {
          type: "DERIVED",
          recipe: "BOOLEAN_YN",
          trueLabel: "예",
        },
      },
    ],
    [
      "an empty lookup map",
      {
        valueBinding: {
          type: "LOOKUP",
          profileFieldKey: "education.university.degreeLevel",
          optionMap: {},
        },
      },
    ],
    [
      "a lookup map with a blank target",
      {
        valueBinding: {
          type: "LOOKUP",
          profileFieldKey: "education.university.degreeLevel",
          optionMap: { 학사: "" },
        },
      },
    ],
    [
      "a button-option binding without a code map",
      {
        valueBinding: {
          type: "BUTTON_OPTION",
          profileFieldKey: "careers.career.position",
          optionMap: { 대리: "대리" },
        },
      },
    ],
    [
      "a button-option binding with a missing target code",
      {
        valueBinding: {
          type: "BUTTON_OPTION",
          profileFieldKey: "careers.career.position",
          optionMap: { 대리: "대리" },
          optionCodeMap: { 과장: "004" },
        },
      },
    ],
    ["a non-object write plan", { writePlan: "SET_TEXT" }],
    [
      "a forged option id in the write plan",
      { writePlan: { command: "SET_TEXT", optionId: "forged-option" } },
    ],
    ["an unknown write command", { writePlan: { command: "RUN_SCRIPT" } }],
    ["a READY item without a write plan", { writePlan: undefined }],
  ])("rejects a matched field with %s", (_name, override) => {
    expect(() =>
      validateFieldsResponse(fieldsRequest, {
        snapshotId: "snapshot-b",
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: "field-1",
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "contact.contact.email",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
            ...override,
          },
        ],
      }),
    ).toThrow(AnalysisContractError);
  });

  it.each([
    ["an extra property", { profileFieldKey: "contact.contact.email" }],
    ["a non-blocked status", { interactionStatus: "UNVERIFIED" }],
    ["no reason code", { reasonCodes: [] }],
    ["multiple reason codes", { reasonCodes: ["NO_MATCH", "NO_MATCH"] }],
    ["an unknown reason code", { reasonCodes: ["UNKNOWN"] }],
  ])("rejects a NO_MATCH field with %s", (_name, override) => {
    expect(() =>
      validateFieldsResponse(fieldsRequest, {
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
            ...override,
          },
        ],
      }),
    ).toThrow(AnalysisContractError);
  });

  it.each([
    ["a stale snapshot", { snapshotId: "stale" }],
    ["a non-array fields value", { fields: {} }],
    ["an extra top-level property", { rawProfileValue: "private" }],
    ["an empty warning list", { warningCodes: [] }],
    ["an unknown warning code", { warningCodes: ["UNKNOWN_WARNING"] }],
    [
      "a non-blocked block code",
      { analysisStatus: "PARTIAL", blockCode: "ADAPTER_POLICY_UNAVAILABLE" },
    ],
    [
      "an unsupported field block code",
      { analysisStatus: "BLOCKED", blockCode: "UNSUPPORTED_SNAPSHOT" },
    ],
  ])("rejects a fields envelope containing %s", (_name, override) => {
    expect(() =>
      validateFieldsResponse(fieldsRequest, {
        snapshotId: "snapshot-b",
        mode: "GENERIC",
        analysisStatus: "PARTIAL",
        fields: [],
        ...override,
      }),
    ).toThrow(AnalysisContractError);
  });

  it("accepts a non-ready match without an executable write plan", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "contact.contact.email",
          },
          autofillPolicy: "SENSITIVE_CONFIRMATION",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "UNVERIFIED",
        },
      ],
    });

    expect(result.fields[0]).toMatchObject({
      candidateId: "field-1",
      interactionStatus: "UNVERIFIED",
    });
  });

  it("accepts a canonical top-level profile field binding", () => {
    const result = validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "education.education.latestEducationType",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    });

    expect(result.fields[0]?.candidateId).toBe("field-1");
  });

  it("labels a malformed field without trusting an absent candidate id", () => {
    expect(() =>
      validateFieldsResponse(fieldsRequest, {
        snapshotId: "snapshot-b",
        mode: "GENERIC",
        analysisStatus: "PARTIAL",
        fields: [null],
      }),
    ).toThrow("필드 식별할 수 없는 후보");
  });
});

it("rejects SET_TEXT for a text-trigger BUTTON_OPTION binding", () => {
  expect(() =>
    validateFieldsResponse(fieldsRequest, {
      snapshotId: "snapshot-b",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field-1",
          matchType: "MATCH",
          valueBinding: {
            type: "BUTTON_OPTION",
            profileFieldKey: "education.university.schoolRegion",
            optionMap: { 서울: "대한민국" },
            optionCodeMap: { 대한민국: "KR" },
          },
          autofillPolicy: "CONDITIONAL",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    }),
  ).toThrow(AnalysisContractError);
});

describe("SELECT_DATE capability", () => {
  const calendarRequest: FieldsAnalyzeRequest = {
    ...fieldsRequest,
    supportedWriteCommands: ["SELECT_DATE"],
    sections: [
      {
        ...fieldsRequest.sections[0]!,
        fields: [
          {
            candidateId: "field-1",
            element: "input",
            control: "text",
            visibility: "visible",
            readonly: true,
            semanticContext: { inputType: "text" },
          },
        ],
      },
    ],
  };
  const calendarResponse = {
    snapshotId: "snapshot-b",
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "field-1",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "military.military.serviceStartDate",
        },
        autofillPolicy: "ALLOWED",
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
      },
    ],
  };

  it("accepts SELECT_DATE for a date-defined DIRECT profile key", () => {
    expect(
      validateFieldsResponse(calendarRequest, calendarResponse).fields[0],
    ).toMatchObject({ writePlan: { command: "SELECT_DATE" } });
  });

  it("rejects SELECT_DATE for a non-date DIRECT profile key", () => {
    expect(() =>
      validateFieldsResponse(calendarRequest, {
        ...calendarResponse,
        fields: [
          {
            ...calendarResponse.fields[0],
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "education.university.schoolName",
            },
          },
        ],
      }),
    ).toThrow(AnalysisContractError);
  });

  it("rejects SELECT_DATE when the client does not support it", () => {
    expect(() =>
      validateFieldsResponse(
        { ...calendarRequest, supportedWriteCommands: undefined },
        calendarResponse,
      ),
    ).toThrow(AnalysisContractError);
  });

  it("keeps SEARCH_SELECTION for a non-date readonly text field", () => {
    expect(
      validateFieldsResponse(calendarRequest, {
        ...calendarResponse,
        fields: [
          {
            ...calendarResponse.fields[0],
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "education.university.schoolName",
            },
            writePlan: { command: "SEARCH_SELECTION" },
          },
        ],
      }).fields[0],
    ).toMatchObject({ writePlan: { command: "SEARCH_SELECTION" } });
  });
});

describe("Greeting custom execution contracts", () => {
  function contract(command: "SEARCH_SELECTION" | "SELECT_DATE") {
    const date = command === "SELECT_DATE";
    const request: FieldsAnalyzeRequest = {
      schemaVersion: 2,
      snapshotId: "greeting-contract",
      site: { host: "sample.career.greetinghr.com", pathPattern: "/apply" },
      supportedWriteCommands: ["SELECT_DATE"],
      sections: [
        {
          sectionId: "s1",
          fields: [
            {
              candidateId: "f1",
              element: "input",
              control: date ? "button" : "text",
              visibility: "visible",
              domName: date
                ? "basicInformation.birthdate"
                : "educationalBackground.universities.0.schoolName",
            },
          ],
        },
      ],
    };
    const response = {
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "f1",
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: date
              ? "personal.personal.birthDate"
              : "education.university.schoolName",
          },
          writePlan: { command },
        },
      ],
    };
    return { request, response };
  }
  it.each(["SEARCH_SELECTION", "SELECT_DATE"] as const)(
    "validates %s on an arbitrary custom domain using the existing base candidates",
    (command) => {
      const { request, response } = contract(command);
      const basicFields = [
        "basicInformation.name",
        "basicInformation.phoneNumber.nationalNumber",
      ].map((domName, index) => ({
        candidateId: `base-${index}`,
        element: "input" as const,
        control: "text" as const,
        visibility: "visible" as const,
        domName,
      }));
      const customRequest = {
        ...request,
        site: {
          host: "jobs.unregistered.example",
          pathPattern: "/ko/o/*/apply",
        },
        sections: [
          {
            ...request.sections[0]!,
            fields: [...request.sections[0]!.fields, ...basicFields],
          },
        ],
      };
      const customResponse = {
        ...response,
        fields: [
          ...response.fields,
          ...basicFields.map((field) => ({
            candidateId: field.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          })),
        ],
      };
      expect(
        validateFieldsResponse(customRequest, customResponse).fields[0],
      ).toMatchObject({ writePlan: { command } });
      expect(() =>
        validateFieldsResponse(
          {
            ...customRequest,
            sections: [
              {
                ...customRequest.sections[0],
                fields: [
                  ...customRequest.sections[0].fields,
                  { ...basicFields[0], candidateId: "duplicate-name" },
                ],
              },
            ],
          },
          {
            ...customResponse,
            fields: [
              ...customResponse.fields,
              { ...customResponse.fields[1], candidateId: "duplicate-name" },
            ],
          },
        ),
      ).toThrow(AnalysisContractError);
    },
  );
  it.each(["SEARCH_SELECTION", "SELECT_DATE"] as const)(
    "allows %s only with the Greeting designation",
    (command) => {
      const { request, response } = contract(command);
      expect(validateFieldsResponse(request, response).fields[0]).toMatchObject(
        { writePlan: { command } },
      );
      expect(() =>
        validateFieldsResponse(
          {
            ...request,
            site: { ...request.site, host: "unregistered.example" },
          },
          response,
        ),
      ).toThrow(AnalysisContractError);
    },
  );
  it.each([
    [
      "educationalBackground.highSchool.schoolName",
      "education.highSchool.schoolName",
      "SEARCH_SELECTION",
    ],
    [
      "workHistory.workExperiences.0.companyName",
      "careers.career.companyName",
      "SEARCH_SELECTION",
    ],
    [
      "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
      "languages.languageTest.testName",
      "SEARCH_SELECTION",
    ],
    [
      "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials",
      "certifications.certificate.name",
      "SEARCH_SELECTION",
    ],
    [
      "educationalBackground.highSchool.enrollmentPeriod.startDate",
      "education.highSchool.startDate",
      "SELECT_DATE",
    ],
    [
      "workHistory.workExperiences.0.employmentPeriod.startDate",
      "careers.career.startDate",
      "SELECT_DATE",
    ],
    [
      "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.acquisitionDate",
      "languages.languageTest.acquisitionDate",
      "SELECT_DATE",
    ],
    [
      "languagesCertificationsAndOtherActivity.certificatesLicenses.0.acquisitionDate",
      "certifications.certificate.acquisitionDate",
      "SELECT_DATE",
    ],
    [
      "workHistory.projects.0.projectPeriod.startDate",
      "projects.project.startDate",
      "SELECT_DATE",
    ],
    [
      "workHistory.projects.0.projectPeriod.endDate",
      "projects.project.endDate",
      "SELECT_DATE",
    ],
  ] as const)(
    "validates supported dependent field %s",
    (name, key, command) => {
      const { request, response } = contract(command);
      request.sections[0]!.fields[0]!.domName = name;
      response.fields[0]!.valueBinding.profileFieldKey = key;
      expect(validateFieldsResponse(request, response).fields[0]).toMatchObject(
        { writePlan: { command } },
      );
    },
  );
  it.each([1, 2])(
    "validates composed additional major slot %s without a new API field",
    (slot) => {
      const { request, response } = contract("SEARCH_SELECTION");
      request.sections[0]!.fields[0]!.domName = `educationalBackground.universities.0.majors.${slot}`;
      const derived = {
        ...response,
        fields: [
          {
            ...response.fields[0],
            valueBinding: {
              type: "DERIVED",
              recipe: `UNIVERSITY_ADDITIONAL_MAJOR_${slot}_NAME`,
            },
          },
        ],
      };
      expect(validateFieldsResponse(request, derived).fields[0]).toMatchObject({
        writePlan: { command: "SEARCH_SELECTION" },
      });
    },
  );
  it("accepts nationality search only for the exact nationality binding", () => {
    const { request, response } = contract("SEARCH_SELECTION");
    request.sections[0]!.fields[0]!.domName =
      "basicInformation.nationalityCode";
    request.sections[0]!.fields[0]!.displayName = "국적";
    response.fields[0]!.valueBinding.profileFieldKey =
      "personal.personal.nationality";
    expect(validateFieldsResponse(request, response).fields[0]).toMatchObject({
      writePlan: { command: "SEARCH_SELECTION" },
    });
    response.fields[0]!.valueBinding.profileFieldKey =
      "education.university.schoolName";
    expect(() => validateFieldsResponse(request, response)).toThrow(
      AnalysisContractError,
    );
  });
  it("requires the calendar capability even for a designated Greeting date", () => {
    const { request, response } = contract("SELECT_DATE");
    expect(() =>
      validateFieldsResponse(
        { ...request, supportedWriteCommands: undefined },
        response,
      ),
    ).toThrow(AnalysisContractError);
  });
  it("allows a designated Greeting military month date with its date profile key", () => {
    const { request, response } = contract("SELECT_DATE");
    request.sections[0]!.fields[0]!.domName =
      "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate";
    response.fields[0]!.valueBinding.profileFieldKey =
      "military.military.serviceStartDate";
    expect(validateFieldsResponse(request, response).fields[0]).toMatchObject({
      writePlan: { command: "SELECT_DATE" },
    });
  });
});

describe("Greeting English name manual review", () => {
  const request: FieldsAnalyzeRequest = {
    ...fieldsRequest,
    site: { host: "sample.career.greetinghr.com", pathPattern: "/apply" },
    sections: [
      {
        sectionId: "s1",
        fields: [
          {
            ...fieldsRequest.sections[0]!.fields[0]!,
            domName: "basicInformation.englishName",
          },
        ],
      },
    ],
  };
  const response = {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "field-1",
        matchType: "NO_MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "UNVERIFIED",
        reasonCodes: ["ENGLISH_NAME_ORDER_UNVERIFIED"],
      },
    ],
  };
  it("rejects the obsolete English name order review response", () => {
    expect(() => validateFieldsResponse(request, response)).toThrow(
      AnalysisContractError,
    );
  });
  it.each([
    { fields: [{ ...response.fields[0], writePlan: { command: "SET_TEXT" } }] },
    { fields: [{ ...response.fields[0], mappingStatus: "LLM_SUGGESTED" }] },
  ])("rejects an untrusted or writable manual review contract", (override) => {
    expect(() =>
      validateFieldsResponse(request, { ...response, ...override }),
    ).toThrow(AnalysisContractError);
  });
  it.each([
    { domName: "customQuestion.englishName" },
    { control: "select" as const },
    { element: "textarea" as const },
  ])("rejects the reason on unrelated fields", (override) => {
    expect(() =>
      validateFieldsResponse(
        {
          ...request,
          sections: [
            {
              sectionId: "s1",
              fields: [{ ...request.sections[0]!.fields[0]!, ...override }],
            },
          ],
        },
        response,
      ),
    ).toThrow(AnalysisContractError);
  });
});
