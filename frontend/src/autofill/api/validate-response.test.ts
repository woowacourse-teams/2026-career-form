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
