import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { installExecutionPolicy } from "./execution-policy";

afterEach(() => {
  cleanup();
  installExecutionPolicy(document);
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("emits the actual generic review grade and classified section on review entry", async () => {
  vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
  document.body.innerHTML =
    '<section><h3>PRIVATE_HEADING</h3><label>PRIVATE_LABEL<input value="PRIVATE_VALUE" /></label></section>';
  let notify!: (line: string) => void;
  const emitted = new Promise<string>((resolve) => {
    notify = resolve;
  });
  const info = vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    if (String(line).startsWith("[CareerForm] 진단 요약:"))
      notify(String(line));
  });
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [],
    }),
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category: "education",
        confidence: 1,
      })),
    }),
    analyzeGenericFields: async (request) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => ({
          candidateId: field.candidateId,
          profileFieldKey: null,
          confidence: 0,
          categoryConfirmed: true,
          interactionStatus: "BLOCKED",
        })),
      ),
    }),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => createEmptyProfile() }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  const line = await emitted;
  expect(info).toHaveBeenCalledTimes(1);
  expect(line).not.toContain("PRIVATE");
  const summary = JSON.parse(line.slice("[CareerForm] 진단 요약: ".length));
  expect(summary.fields).toEqual([
    {
      grade: "BLOCKED",
      reasonCode: "UNLINKED",
      sectionCategory: "education",
      repeatRowIndex: null,
      controlKind: "text",
      mapped: false,
      mappedKeyCategory: null,
    },
  ]);
});
