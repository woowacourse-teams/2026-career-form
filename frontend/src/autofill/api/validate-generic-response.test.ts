import { describe, expect, it } from "vitest";

import type { GenericFieldsRequest, SectionClassifyRequest } from "./types";
import { AnalysisContractError } from "./validate-response";
import {
  validateGenericFieldsResponse,
  validateSectionClassifyResponse,
} from "./validate-generic-response";

const site = { host: "example.test", pathPattern: "/apply" };

const classifyRequest: SectionClassifyRequest = {
  schemaVersion: 1,
  snapshotId: "classify-1",
  site,
  sections: [
    {
      sectionId: "secA",
      title: "합성 섹션",
      labels: ["합성 라벨"],
      controlKinds: ["TEXT", "SELECT"],
      repeated: false,
    },
    {
      sectionId: "secB",
      parentSectionId: "secA",
      labels: [],
      controlKinds: ["BUTTON"],
      repeated: true,
    },
  ],
};

const classifyComplete = (sections: unknown[], extra: object = {}) => ({
  schemaVersion: 1,
  snapshotId: "classify-1",
  status: "COMPLETE",
  sections,
  ...extra,
});

const sectionA = { sectionId: "secA", category: "education", confidence: 0.9 };
const sectionB = { sectionId: "secB", category: "careers", confidence: 0 };

describe("section classification response validation", () => {
  it("accepts a complete response that covers every requested section once", () => {
    expect(
      validateSectionClassifyResponse(
        classifyRequest,
        classifyComplete([sectionA, { ...sectionB, confidence: 1 }]),
      ),
    ).toMatchObject({
      status: "COMPLETE",
      sections: [{ sectionId: "secA" }, { sectionId: "secB" }],
    });
  });

  it("accepts unseen category names of 1 to 32 characters", () => {
    expect(
      validateSectionClassifyResponse(
        classifyRequest,
        classifyComplete([
          { ...sectionA, category: "x" },
          { ...sectionB, category: "a".repeat(32) },
        ]),
      ),
    ).toMatchObject({ status: "COMPLETE" });
  });

  it.each(["STATIC_POLICY_PRESENT", "POLICY_UNAVAILABLE"])(
    "accepts the %s short circuit with empty sections",
    (status) => {
      expect(
        validateSectionClassifyResponse(classifyRequest, {
          schemaVersion: 1,
          snapshotId: "classify-1",
          status,
          sections: [],
        }),
      ).toMatchObject({ status, sections: [] });
    },
  );

  it.each<[string, unknown]>([
    [
      "schemaVersion 2",
      { ...classifyComplete([sectionA, sectionB]), schemaVersion: 2 },
    ],
    [
      "snapshot mismatch",
      { ...classifyComplete([sectionA, sectionB]), snapshotId: "other" },
    ],
    [
      "unknown envelope key",
      classifyComplete([sectionA, sectionB], { mode: "GENERIC" }),
    ],
    [
      "unknown status",
      { ...classifyComplete([sectionA, sectionB]), status: "PARTIAL" },
    ],
    ["non-array sections", { ...classifyComplete([]), sections: {} }],
    [
      "unknown section key",
      classifyComplete([{ ...sectionA, reason: "x" }, sectionB]),
    ],
    [
      "section not requested",
      classifyComplete([
        sectionA,
        sectionB,
        { ...sectionB, sectionId: "secC" },
      ]),
    ],
    ["duplicate section", classifyComplete([sectionA, sectionA, sectionB])],
    ["missing section", classifyComplete([sectionA])],
    [
      "empty category",
      classifyComplete([{ ...sectionA, category: "" }, sectionB]),
    ],
    [
      "33 character category",
      classifyComplete([{ ...sectionA, category: "a".repeat(33) }, sectionB]),
    ],
    [
      "non-string category",
      classifyComplete([{ ...sectionA, category: 3 }, sectionB]),
    ],
    [
      "negative confidence",
      classifyComplete([{ ...sectionA, confidence: -0.01 }, sectionB]),
    ],
    [
      "confidence above one",
      classifyComplete([{ ...sectionA, confidence: 1.01 }, sectionB]),
    ],
    [
      "infinite confidence",
      classifyComplete([{ ...sectionA, confidence: Infinity }, sectionB]),
    ],
    [
      "non-number confidence",
      classifyComplete([{ ...sectionA, confidence: "0.5" }, sectionB]),
    ],
    [
      "short circuit with sections",
      {
        schemaVersion: 1,
        snapshotId: "classify-1",
        status: "STATIC_POLICY_PRESENT",
        sections: [sectionA],
      },
    ],
    ["non-object", null],
  ])("rejects %s", (_name, value) => {
    expect(() =>
      validateSectionClassifyResponse(classifyRequest, value),
    ).toThrow(AnalysisContractError);
  });
});

const fieldsRequest: GenericFieldsRequest = {
  schemaVersion: 2,
  snapshotId: "generic-1",
  site,
  sections: [
    {
      sectionId: "secA",
      category: "contact",
      fields: [
        {
          candidateId: "c1",
          element: "input",
          control: "text",
          visibility: "visible",
        },
      ],
      items: [
        {
          itemId: "row1",
          fields: [
            {
              candidateId: "c2",
              element: "select",
              control: "select",
              visibility: "visible",
            },
          ],
        },
      ],
    },
    {
      sectionId: "secB",
      fields: [
        {
          candidateId: "c3",
          element: "textarea",
          control: "textarea",
          visibility: "visible",
        },
      ],
    },
  ],
};

const field = (candidateId: string, extra: object = {}) => ({
  candidateId,
  profileFieldKey: "contact.contact.email",
  confidence: 0.85,
  categoryConfirmed: true,
  ...extra,
});

const fieldsComplete = (fields: unknown[], extra: object = {}) => ({
  schemaVersion: 1,
  snapshotId: "generic-1",
  status: "COMPLETE",
  fields,
  diagnostics: { jevCalls: 2, elapsedMs: 120 },
  ...extra,
});

const allFields = () => [
  field("c1"),
  field("c2", {
    profileFieldKey: "education.university.schoolType",
    categoryConfirmed: false,
  }),
  field("c3", {
    profileFieldKey: null,
    confidence: 0,
    categoryConfirmed: false,
    reason: "LLM_UNAVAILABLE",
  }),
];

describe("generic fields response validation", () => {
  it("accepts every requested candidate once, including unavailable and unconfirmed fields", () => {
    expect(
      validateGenericFieldsResponse(fieldsRequest, fieldsComplete(allFields())),
    ).toMatchObject({
      status: "COMPLETE",
      fields: [
        { candidateId: "c1" },
        { candidateId: "c2", categoryConfirmed: false },
        { candidateId: "c3", profileFieldKey: null, reason: "LLM_UNAVAILABLE" },
      ],
    });
  });

  it.each(["STATIC_POLICY_PRESENT", "POLICY_UNAVAILABLE"])(
    "accepts the %s short circuit with empty fields and zero diagnostics",
    (status) => {
      expect(
        validateGenericFieldsResponse(fieldsRequest, {
          schemaVersion: 1,
          snapshotId: "generic-1",
          status,
          fields: [],
          diagnostics: { jevCalls: 0, elapsedMs: 0 },
        }),
      ).toMatchObject({ status, fields: [] });
    },
  );

  it.each<[string, unknown]>([
    [
      "schemaVersion 2 echoed from the request",
      { ...fieldsComplete(allFields()), schemaVersion: 2 },
    ],
    [
      "snapshot mismatch",
      { ...fieldsComplete(allFields()), snapshotId: "other" },
    ],
    ["unknown envelope key", fieldsComplete(allFields(), { mode: "GENERIC" })],
    ["unknown status", { ...fieldsComplete(allFields()), status: "PARTIAL" }],
    ["candidate not requested", fieldsComplete([...allFields(), field("c9")])],
    ["duplicate candidate", fieldsComplete([...allFields(), field("c1")])],
    ["missing candidate", fieldsComplete(allFields().slice(0, 2))],
    [
      "unsupported profile key",
      fieldsComplete([
        field("c1", { profileFieldKey: "contact.contact.unknownKey" }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "excluded profile key",
      fieldsComplete([
        field("c1", {
          profileFieldKey: "certifications.certificate.evidenceDocumentPath",
        }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "non-string profile key",
      fieldsComplete([
        field("c1", { profileFieldKey: 7 }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "unknown reason",
      fieldsComplete([
        field("c1", { reason: "NO_MATCH" }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "unknown field key",
      fieldsComplete([
        field("c1", { valueBinding: {} }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "negative confidence",
      fieldsComplete([
        field("c1", { confidence: -0.1 }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "confidence above one",
      fieldsComplete([
        field("c1", { confidence: 1.5 }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "non-boolean categoryConfirmed",
      fieldsComplete([
        field("c1", { categoryConfirmed: "yes" }),
        ...allFields().slice(1),
      ]),
    ],
    [
      "missing diagnostics",
      (({ diagnostics: _d, ...rest }) => rest)(fieldsComplete(allFields())),
    ],
    [
      "negative jevCalls",
      fieldsComplete(allFields(), {
        diagnostics: { jevCalls: -1, elapsedMs: 0 },
      }),
    ],
    [
      "negative elapsedMs",
      fieldsComplete(allFields(), {
        diagnostics: { jevCalls: 0, elapsedMs: -5 },
      }),
    ],
    [
      "fractional elapsedMs",
      fieldsComplete(allFields(), {
        diagnostics: { jevCalls: 0, elapsedMs: 1.5 },
      }),
    ],
    [
      "unknown diagnostics key",
      fieldsComplete(allFields(), {
        diagnostics: { jevCalls: 0, elapsedMs: 0, tokens: 1 },
      }),
    ],
    [
      "short circuit with fields",
      {
        schemaVersion: 1,
        snapshotId: "generic-1",
        status: "POLICY_UNAVAILABLE",
        fields: [field("c1")],
        diagnostics: { jevCalls: 0, elapsedMs: 0 },
      },
    ],
    [
      "short circuit with non-zero diagnostics",
      {
        schemaVersion: 1,
        snapshotId: "generic-1",
        status: "STATIC_POLICY_PRESENT",
        fields: [],
        diagnostics: { jevCalls: 1, elapsedMs: 0 },
      },
    ],
    ["non-object", "COMPLETE"],
  ])("rejects %s", (_name, value) => {
    expect(() => validateGenericFieldsResponse(fieldsRequest, value)).toThrow(
      AnalysisContractError,
    );
  });
});
