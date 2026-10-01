import { describe, expect, it, vi } from "vitest";

import type { FieldsAnalyzeRequest, PreparationAnalyzeRequest } from "./types";
import {
  AnalysisServiceError,
  RuntimeAnalysisApiClient,
} from "./runtime-client";

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
