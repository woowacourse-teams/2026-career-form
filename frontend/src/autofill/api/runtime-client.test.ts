import { describe, expect, it, vi } from "vitest";

import type { FieldsAnalyzeRequest, PreparationAnalyzeRequest } from "./types";
import {
  AnalysisServiceError,
  RuntimeAnalysisApiClient,
} from "./runtime-client";
import type { GenericFieldsRequest, SectionClassifyRequest } from "./types";
import type { InteractionDecisionRequest } from "./interaction-types";
import { AnalysisContractError } from "./validate-response";

const request: FieldsAnalyzeRequest = {
  schemaVersion: 2,
  snapshotId: "snapshot-b",
  site: { host: "example.test", pathPattern: "/apply" },
  sections: [
    {
      sectionId: "contact",
      fields: [
        {
          candidateId: "email",
          element: "input",
          control: "text",
          visibility: "visible",
          displayName: "이메일",
        },
      ],
    },
  ],
};

describe("RuntimeAnalysisApiClient", () => {
  it("sends the existing field request unchanged after Greeting preparation", async () => {
    const preparation: PreparationAnalyzeRequest = {
      schemaVersion: 2,
      snapshotId: "preparation-1",
      site: {
        host: "career.hyundai-autoever.com",
        pathPattern: "/ko/o/*/apply",
      },
      sections: [{ sectionId: "section-root", actionCandidates: [] }],
    };
    const fieldRequest: FieldsAnalyzeRequest = {
      ...request,
      site: preparation.site,
    };
    const sendMessage = vi.fn(async (message: unknown) => {
      const typed = message as { type: string };
      return typed.type === "AUTOFILL_ANALYZE_PREPARATION"
        ? {
            ok: true as const,
            data: {
              snapshotId: "preparation-1",
              mode: "ADAPTER",
              analysisStatus: "COMPLETE",
              preparationPlans: [],
            },
          }
        : {
            ok: true as const,
            data: {
              snapshotId: "snapshot-b",
              mode: "ADAPTER",
              analysisStatus: "COMPLETE",
              fields: [
                {
                  candidateId: "email",
                  matchType: "NO_MATCH",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "BLOCKED",
                  reasonCodes: ["NO_MATCH"],
                },
              ],
            },
          };
    });
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await client.analyzePreparation(preparation);
    await client.analyzeFields(fieldRequest);

    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      type: "AUTOFILL_ANALYZE_FIELDS",
      payload: fieldRequest,
      qualityRun: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("returns a validated response from the extension background boundary", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true as const,
      data: {
        snapshotId: "snapshot-b",
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: "email",
            matchType: "MATCH",
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ],
      },
    }));
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(client.analyzeFields(request)).resolves.toMatchObject({
      snapshotId: "snapshot-b",
      fields: [{ candidateId: "email" }],
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "AUTOFILL_ANALYZE_FIELDS",
      payload: request,
      qualityRun: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("does not retry with fixtures when the background reports unavailable", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: false as const,
      code: "NOT_CONFIGURED" as const,
    }));
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(client.analyzeFields(request)).rejects.toThrow(
      AnalysisServiceError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed background envelopes without exposing their contents", async () => {
    const sendMessage = vi.fn(async () => ({ secret: "raw server response" }));
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(client.analyzeFields(request)).rejects.toThrow(
      "분석 서버 응답을 확인할 수 없습니다.",
    );
  });
});

const genericSite = { host: "example.test", pathPattern: "/apply" };
const classifyRequest: SectionClassifyRequest = {
  schemaVersion: 1,
  snapshotId: "classify-1",
  site: genericSite,
  sections: [
    {
      sectionId: "secA",
      labels: ["합성 라벨"],
      controlKinds: ["TEXT"],
      repeated: false,
    },
  ],
};
const genericFieldsRequest: GenericFieldsRequest = {
  schemaVersion: 2,
  snapshotId: "generic-1",
  site: genericSite,
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
    },
  ],
};
const structureRequest: InteractionDecisionRequest = {
  schemaVersion: 2,
  snapshotId: "structure-1",
  site: genericSite,
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
      ],
    },
    {
      decisionId: "reveal",
      role: "SECTION_REVEAL",
      canonicalFieldKey: "careers.career.companyName",
      candidates: [
        {
          candidateId: "revealButton",
          element: "button",
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
      ],
    },
  ],
};

const respond = (data: unknown) =>
  vi.fn(async (_message: unknown) => ({ ok: true as const, data }));

describe("RuntimeAnalysisApiClient generic endpoints", () => {
  it("classifies sections through the generic message and validates the response", async () => {
    const data = {
      schemaVersion: 1,
      snapshotId: "classify-1",
      status: "COMPLETE",
      sections: [{ sectionId: "secA", category: "education", confidence: 0.7 }],
    };
    const sendMessage = respond(data);
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(client.classifySections(classifyRequest)).resolves.toEqual(
      data,
    );
    expect(sendMessage).toHaveBeenCalledWith({
      type: "AUTOFILL_GENERIC_CLASSIFY_SECTIONS",
      payload: classifyRequest,
      qualityRun: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("rejects a section classification response outside the contract", async () => {
    const client = new RuntimeAnalysisApiClient(
      respond({
        schemaVersion: 1,
        snapshotId: "classify-1",
        status: "COMPLETE",
        sections: [
          { sectionId: "secOther", category: "education", confidence: 0.7 },
        ],
      }),
    );

    await expect(client.classifySections(classifyRequest)).rejects.toThrow(
      AnalysisContractError,
    );
  });

  it("analyzes generic fields through the generic message and validates the response", async () => {
    const data = {
      schemaVersion: 1,
      snapshotId: "generic-1",
      status: "COMPLETE",
      fields: [
        {
          candidateId: "c1",
          profileFieldKey: "contact.contact.email",
          confidence: 0.9,
          categoryConfirmed: true,
        },
      ],
      diagnostics: { jevCalls: 1, elapsedMs: 30 },
    };
    const sendMessage = respond(data);
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(
      client.analyzeGenericFields(genericFieldsRequest),
    ).resolves.toEqual(data);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "AUTOFILL_GENERIC_ANALYZE_FIELDS",
      payload: genericFieldsRequest,
      qualityRun: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("rejects a generic fields response whose candidate ids do not match", async () => {
    const client = new RuntimeAnalysisApiClient(
      respond({
        schemaVersion: 1,
        snapshotId: "generic-1",
        status: "COMPLETE",
        fields: [
          {
            candidateId: "cOther",
            profileFieldKey: null,
            confidence: 0,
            categoryConfirmed: false,
            reason: "LLM_UNAVAILABLE",
          },
        ],
        diagnostics: { jevCalls: 0, elapsedMs: 0 },
      }),
    );

    await expect(
      client.analyzeGenericFields(genericFieldsRequest),
    ).rejects.toThrow(AnalysisContractError);
  });

  it("sends structure roles with targetKind through decideInteractions", async () => {
    const data = {
      schemaVersion: 2,
      snapshotId: "structure-1",
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: [
        {
          decisionId: "addRow",
          role: "REPEAT_ADD",
          selection: "SELECTED",
          candidateId: "addButton",
        },
        {
          decisionId: "reveal",
          role: "SECTION_REVEAL",
          selection: "ABSTAINED",
          candidateId: null,
        },
        {
          decisionId: "kindMaster",
          role: "ROW_KIND_OPTION",
          selection: "SELECTED",
          candidateId: "optMaster",
        },
      ],
    };
    const sendMessage = respond(data);
    const client = new RuntimeAnalysisApiClient(sendMessage);

    await expect(client.decideInteractions(structureRequest)).resolves.toEqual(
      data,
    );
    expect(sendMessage).toHaveBeenCalledWith({
      type: "AUTOFILL_DECIDE_INTERACTIONS",
      payload: structureRequest,
      qualityRun: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[0])).toContain(
      '"targetKind":"MASTER"',
    );
  });
});
