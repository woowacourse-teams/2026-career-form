import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { installExecutionPolicy } from "./execution-policy";

afterEach(() => {
  cleanup();
  installExecutionPolicy(document);
  document.body.replaceChildren();
});

const row = (index: number) =>
  `<div ismultirow="true">
    <label>회사명<input name="company${index}" /></label>
    <label>직무<input name="role${index}" /></label>
  </div>`;

function mountCareerForm() {
  document.body.innerHTML = `<section><h3>경력</h3>
    <div id="rows">${row(0)}</div>
    <button type="button" id="add">경력 추가</button></section>`;
  const rows = document.querySelector("#rows")!;
  document.querySelector("#add")!.addEventListener("click", () => {
    rows.insertAdjacentHTML(
      "beforeend",
      row(rows.querySelectorAll("[ismultirow]").length),
    );
  });
  return () => rows.querySelectorAll("[ismultirow]").length;
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

function createClient(options: { interactions?: boolean } = {}) {
  const analyzePreparation = vi.fn(async (request: { snapshotId: string }) => ({
    snapshotId: request.snapshotId,
    mode: "GENERIC" as const,
    analysisStatus: "COMPLETE" as const,
    preparationPlans: [],
  }));
  const decideInteractions = vi.fn(
    async (request: InteractionDecisionRequest) => ({
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
    }),
  );
  const analyzeGenericFields = vi.fn(async (request) => ({
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
  const client = {
    analyzePreparation,
    analyzeFields: vi.fn(async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC" as const,
      analysisStatus: "COMPLETE" as const,
      fields: [],
    })),
    classifySections: vi.fn(async (request) => ({
      schemaVersion: 1 as const,
      snapshotId: request.snapshotId,
      status: "COMPLETE" as const,
      sections: request.sections.map((section: { sectionId: string }) => ({
        sectionId: section.sectionId,
        category: "careers",
        confidence: 1,
      })),
    })),
    analyzeGenericFields,
    ...(options.interactions === false ? {} : { decideInteractions }),
  } as unknown as AnalysisApiClient;
  return {
    client,
    analyzePreparation,
    decideInteractions,
    analyzeGenericFields,
  };
}

function renderWorkflow(client: AnalysisApiClient, profile: Profile) {
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={client}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
}

describe("generic structure loop gate in the workflow", () => {
  it("adds rows with the loop and never asks the server for a preparation plan", async () => {
    const rowCount = mountCareerForm();
    const api = createClient();

    renderWorkflow(api.client, profileWithCareers(3));
    await waitFor(() => expect(api.analyzeGenericFields).toHaveBeenCalled());

    expect(rowCount()).toBe(3);
    expect(api.analyzePreparation).not.toHaveBeenCalled();
    expect(
      api.decideInteractions.mock.calls.map(
        ([request]) => request.decisions[0]!.role,
      ),
    ).toEqual(["REPEAT_ADD"]);
  });

  it("keeps the preparation analysis when the document has an execution policy", async () => {
    const rowCount = mountCareerForm();
    const api = createClient();
    api.client.analyzeFields = async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [],
      executionPolicy: fixturePolicy("sk"),
    });
    (api.client as { loadExecutionPolicy?: unknown }).loadExecutionPolicy =
      async () => fixturePolicy("sk");

    renderWorkflow(api.client, profileWithCareers(3));
    await waitFor(() => expect(api.analyzePreparation).toHaveBeenCalled());

    expect(api.decideInteractions).not.toHaveBeenCalled();
    expect(rowCount()).toBe(1);
  });

  it("uses the structure loop when only the common provider policy is installed", async () => {
    const rowCount = mountCareerForm();
    const api = createClient();
    (api.client as { loadExecutionPolicy?: unknown }).loadExecutionPolicy =
      async () => ({
        ...fixturePolicy("sk"),
        browserPolicy: undefined,
        componentPolicy: undefined,
        searches: [],
        failureScopes: [],
        address: null,
      });

    renderWorkflow(api.client, profileWithCareers(3));
    await waitFor(() => expect(api.analyzeGenericFields).toHaveBeenCalled());

    expect(rowCount()).toBe(3);
    expect(api.analyzePreparation).not.toHaveBeenCalled();
    expect(api.decideInteractions).toHaveBeenCalled();
  });

  it("keeps the preparation analysis for site searches without an engine policy", async () => {
    const rowCount = mountCareerForm();
    const api = createClient();
    (api.client as { loadExecutionPolicy?: unknown }).loadExecutionPolicy =
      async () => ({
        ...fixturePolicy("sk"),
        browserPolicy: undefined,
        componentPolicy: undefined,
        address: null,
      });

    renderWorkflow(api.client, profileWithCareers(3));
    await waitFor(() => expect(api.analyzePreparation).toHaveBeenCalled());

    expect(api.decideInteractions).not.toHaveBeenCalled();
    expect(rowCount()).toBe(1);
  });

  it("keeps the preparation analysis when the client has no interaction decisions", async () => {
    const rowCount = mountCareerForm();
    const api = createClient({ interactions: false });

    renderWorkflow(api.client, profileWithCareers(3));
    await waitFor(() => expect(api.analyzePreparation).toHaveBeenCalled());

    expect(rowCount()).toBe(1);
  });
});
