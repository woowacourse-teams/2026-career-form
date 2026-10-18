import { vi } from "vitest";

import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";

export function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.contact.email = "me@example.test";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

export function createApiClient(): AnalysisApiClient {
  return {
    analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC" as const,
      analysisStatus: "COMPLETE" as const,
      preparationPlans: [],
    })),
    analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
      const candidate = request.sections[0]?.fields[0];
      if (!candidate) throw new Error("fixture page is missing its field");
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [
          {
            candidateId: candidate.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
      };
    }),
  };
}

export function createSkFixtureDocument(): Document {
  const fixtureDocument =
    document.implementation.createHTMLDocument("application");
  Object.defineProperty(fixtureDocument, "URL", {
    value: "https://www.skcareers.com/Application/Index/fixture",
  });
  return fixtureDocument;
}
