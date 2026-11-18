import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { installExecutionPolicy } from "./execution-policy";

afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
  installExecutionPolicy(document);
  document.body.replaceChildren();
});

const row = (index: number) =>
  `<div ismultirow="true">
    <label>회사명<input name="company${index}" /></label>
    <label>직무<input name="role${index}" /></label>
  </div>`;

function mountCareerForm(withAddButton = true) {
  document.body.innerHTML = `<section><h3>경력</h3>
    <div id="rows">${withAddButton ? row(0) : row(0) + row(1)}</div>
    ${withAddButton ? '<button type="button" id="add">경력 추가</button>' : '<button type="button">경력 추가 닫기</button>'}</section>`;
  const rows = document.querySelector("#rows")!;
  document.querySelector("#add")?.addEventListener("click", () => {
    rows.insertAdjacentHTML(
      "beforeend",
      row(rows.querySelectorAll("[ismultirow]").length),
    );
  });
}

function profileWithCareers(count: number): Profile {
  const profile = createEmptyProfile();
  profile.careers = Array.from({ length: count }, (_, index) => ({
    id: `career-${index}`,
    sectionId: "career",
    values: {},
  }));
  return profile;
}

function createClient(): AnalysisApiClient {
  const analyzeGenericFields = vi.fn<
    NonNullable<AnalysisApiClient["analyzeGenericFields"]>
  >(async (request) => ({
    schemaVersion: 3 as const,
    snapshotId: request.snapshotId,
    status: "COMPLETE" as const,
    diagnostics: { jevCalls: 0, elapsedMs: 0 },
    fields: request.sections.flatMap(
      (section: { fields: Array<{ candidateId: string }> }) =>
        section.fields.map((field) => ({
          candidateId: field.candidateId,
          profileFieldKey: null,
          confidence: 0,
          categoryConfirmed: false,
          interactionStatus: "BLOCKED" as const,
        })),
    ),
  }));
  return {
    analyzePreparation: vi.fn<AnalysisApiClient["analyzePreparation"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      }),
    ),
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [],
      }),
    ),
    classifySections: vi.fn<NonNullable<AnalysisApiClient["classifySections"]>>(
      async (request) => ({
        schemaVersion: 1 as const,
        snapshotId: request.snapshotId,
        status: "COMPLETE" as const,
        sections: request.sections.map((section: { sectionId: string }) => ({
          sectionId: section.sectionId,
          category: "careers",
          confidence: 1,
        })),
      }),
    ),
    analyzeGenericFields,
    decideInteractions: vi.fn<
      NonNullable<AnalysisApiClient["decideInteractions"]>
    >(async (request) => ({
      schemaVersion: 2 as const,
      snapshotId: request.snapshotId,
      status: "COMPLETE" as const,
      mode: "GENERIC" as const,
      decisions: request.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        role: decision.role,
        selection: "SELECTED" as const,
        candidateId: decision.candidates[0]!.candidateId,
      })),
    })),
  };
}

async function reachResult(client: AnalysisApiClient, profile: Profile) {
  const { container } = render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={client}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" });
  return container;
}

function structureLines(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((message: string) => message.includes("구조 자동 준비"));
}

describe("generic structure diagnostics", () => {
  it("keeps structure preparation out of the result screen", async () => {
    mountCareerForm(false);

    await reachResult(createClient(), profileWithCareers(3));

    expect(screen.queryByText(/구조 자동 준비/)).toBeNull();
    expect(screen.queryByText("자동으로 한 일")).toBeNull();
    expect(document.body.textContent).not.toContain("NO_ADD_CONTROL");
  });

  it("logs status and counts only for the rows added by the loop", async () => {
    mountCareerForm();
    const inputSentinel = "SYNTHETIC_INPUT_SENTINEL_274";
    const profileSentinel = "SYNTHETIC_PROFILE_SENTINEL_274";
    document.querySelector<HTMLInputElement>("input")!.value = inputSentinel;
    const profile = profileWithCareers(3);
    profile.careers[0]!.values.companyName = profileSentinel;
    setAutofillDebugEnabled(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await reachResult(createClient(), profile);
    // A run that starts before the policy settles can reach a first result and
    // is replaced by the final run, which logs the structure line.
    await vi.waitFor(() =>
      expect(structureLines(warn).at(-1)).toContain("ran-with-actions"),
    );

    const lines = structureLines(warn);
    expect(lines.at(-1)).toContain("완료 2");
    expect(lines.at(-1)).not.toContain("경력");
    for (const sentinel of [inputSentinel, profileSentinel]) {
      expect(result).not.toHaveTextContent(sentinel);
      expect(JSON.stringify(lines)).not.toContain(sentinel);
    }
  });
});
