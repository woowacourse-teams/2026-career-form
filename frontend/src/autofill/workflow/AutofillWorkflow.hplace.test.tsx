import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "./test-utils/hplace.fixture";

afterEach(() => {
  resetHplacePage();
});

it("stops an identified public login before profile loading or analysis", async () => {
  renderHplaceLogin();
  const repository = { load: vi.fn(async () => createEmptyProfile()) };
  const apiClient: AnalysisApiClient = {
    analyzePreparation: vi.fn<AnalysisApiClient["analyzePreparation"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
    ),
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [],
      }),
    ),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={repository}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(repository.load).not.toHaveBeenCalled();
  expect(apiClient.analyzePreparation).not.toHaveBeenCalled();
  expect(apiClient.analyzeFields).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>("[name=email]")!.value).toBe(
    "",
  );
});

it("stops preparation when the page becomes identified during its API request", async () => {
  renderHplaceLogin();
  const assets = document.head.innerHTML;
  document.head.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "추가 정보 열기";
  document.body.append(button);
  let clicks = 0;
  button.onclick = () => {
    clicks += 1;
  };
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      const section = request.sections.find(
        (section) => section.actionCandidates.length > 0,
      )!;
      document.head.innerHTML = assets;
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [
          {
            actionCandidateId: section.actionCandidates[0].candidateId,
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: section.sectionId,
          },
        ],
      };
    },
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [],
      }),
    ),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => createEmptyProfile() }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(apiClient.analyzeFields).not.toHaveBeenCalled();
  expect(clicks).toBe(0);
});
