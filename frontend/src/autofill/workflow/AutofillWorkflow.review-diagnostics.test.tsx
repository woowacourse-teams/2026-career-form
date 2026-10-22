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

it.each([false, true])(
  "emits classified review metadata and actual loaded profile binding (mapped=%s)",
  async (mapped) => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
    document.body.innerHTML =
      '<section><h3>PRIVATE_HEADING</h3><label>PRIVATE_LABEL<input value="PRIVATE_VALUE" /></label></section>';
    let notify!: (line: string) => void;
    const emitted = new Promise<string>((resolve) => {
      notify = resolve;
    });
    const info = vi
      .spyOn(console, "info")
      .mockImplementation((line: unknown) => {
        if (String(line).startsWith("[CareerForm] 진단 요약:"))
          notify(String(line));
      });
    const profile = createEmptyProfile();
    if (mapped)
      profile.education.push({
        id: "PRIVATE_BOUND_ENTRY",
        sectionId: "highSchool",
        values: { schoolName: "PRIVATE_PROFILE_VALUE" },
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
      analyzeGenericFields: async (request) => {
        expect(
          document.querySelector("[data-careerform-diagnostic-field]"),
        ).toBeNull();
        return {
          schemaVersion: 3,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          diagnostics: { jevCalls: 0, elapsedMs: 0 },
          fields: request.sections.flatMap((section) =>
            section.fields.map((field) => ({
              candidateId: field.candidateId,
              profileFieldKey: mapped
                ? "education.highSchool.schoolName"
                : null,
              confidence: mapped ? 1 : 0,
              categoryConfirmed: true,
              interactionStatus: mapped
                ? ("READY" as const)
                : ("BLOCKED" as const),
              ...(mapped
                ? {
                    autofillPolicy: "ALLOWED" as const,
                    writePlan: { command: "SET_TEXT" as const },
                  }
                : {}),
            })),
          ),
        };
      },
    };
    render(
      <AutofillWorkflow
        apiClient={apiClient}
        repository={{ load: async () => profile }}
        pageDocument={document}
        onExit={() => undefined}
      />,
    );
    const line = await emitted;
    expect(info).toHaveBeenCalledTimes(1);
    expect(line).not.toContain("PRIVATE");
    const summary = JSON.parse(line.slice("[CareerForm] 진단 요약: ".length));
    if (mapped) {
      expect(summary.fields).toMatchObject([
        {
          fieldOrdinal: 0,
          pageSectionOrdinal: 0,
          profileFieldKey: "education.highSchool.schoolName",
          profileSectionId: "highSchool",
          profileRowOrdinal: 0,
        },
      ]);
    } else {
      expect(summary.fields).toEqual([
        {
          grade: "BLOCKED",
          reasonCode: "UNLINKED",
          sectionCategory: "education",
          repeatRowIndex: null,
          controlKind: "text",
          mapped: false,
          mappedKeyCategory: null,
          fieldOrdinal: 0,
          pageSectionOrdinal: 0,
          profileFieldKey: null,
          profileSectionId: null,
          profileRowOrdinal: null,
        },
      ]);
    }
    expect(document.querySelector("input")).toHaveAttribute(
      "data-careerform-diagnostic-field",
      "0",
    );
  },
);
