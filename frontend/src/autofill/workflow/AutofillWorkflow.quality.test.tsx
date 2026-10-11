import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { QualityObservation, type QualityReport } from "../quality/observation";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => document.body.replaceChildren());

it("실제 입력 흐름의 수집과 쓰기 및 유지 결과를 연결하고 입력값은 보고하지 않는다", async () => {
  document.body.innerHTML = "<label>이름<input></label>";
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성 비공개 입력";
  const reports: QualityReport[] = [];
  const quality = new QualityObservation(async (message) => {
    reports.push((message as { payload: QualityReport }).payload);
    return { ok: true };
  });
  const client: AnalysisApiClient = {
    quality,
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      quality.readySnapshot(request.snapshotId);
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: request.sections
          .flatMap((section) => section.fields)
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.koreanGivenName",
            },
            writePlan: { command: "SET_TEXT" },
          })),
      };
    },
  };
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={client}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(document.querySelector("input")).toHaveValue(
    profile.personal.koreanGivenName,
  );
  await waitFor(
    () => {
      expect(reports.some((report) => report.finished === "COMPLETED")).toBe(
        true,
      );
      expect(
        reports.some((report) =>
          Object.values(report.fields).some(
            (field) => field.written && field.retained,
          ),
        ),
      ).toBe(true);
    },
    { timeout: 2500 },
  );
  expect(
    reports.some((report) => Object.keys(report.identities ?? {}).length > 0),
  ).toBe(true);
  expect(JSON.stringify(reports)).not.toContain(
    profile.personal.koreanGivenName,
  );
});
