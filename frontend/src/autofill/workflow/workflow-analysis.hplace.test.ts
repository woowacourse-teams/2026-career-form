import { afterEach, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { getWorkflowAdapter } from "../adapters/workflow";
import { createAnalyzeFields } from "./workflow-analysis";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "./test-utils/hplace.fixture";

afterEach(() => {
  resetHplacePage();
});

it("rejects an analysis response when Hplace evidence appears while waiting", async () => {
  renderHplaceLogin();
  const assets = document.head.innerHTML;
  document.head.replaceChildren();
  const setStage = vi.fn();
  const setReviewItems = vi.fn();
  const profile = createEmptyProfile();
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async () => {
      throw new Error("Preparation is not part of this test");
    },
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => {
        document.head.innerHTML = assets;
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC",
          analysisStatus: "COMPLETE",
          fields: [],
        };
      },
    ),
  };
  const analyze = createAnalyzeFields({
    adapter: getWorkflowAdapter(document),
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient,
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    setAddressResult: () => undefined,
    setExceptionTitle: () => undefined,
    setStage,
    setFieldsSnapshot: () => undefined,
    setReviewItems,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: () => undefined,
  });
  await analyze(profile);

  expect(setStage).toHaveBeenLastCalledWith("unsupported");
  expect(setReviewItems).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>("[name=email]")!.value).toBe(
    "",
  );
});
