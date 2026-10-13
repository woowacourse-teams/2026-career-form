import { afterEach, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { getWorkflowAdapter } from "../adapters/workflow";
import { createAnalyzeFields } from "./workflow-analysis";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "./test-utils/hplace.fixture";
import {
  mountHplaceRegistration,
  registrationAnalysis,
  installRegistrationValidation,
} from "../adapters/hplace/registration.test-fixtures";

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

it("stops Hplace reanalysis before a fourth fields request even if drivers split into separate stages", async () => {
  mountHplaceRegistration();
  const validation = installRegistrationValidation();
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "테스트";
  profile.personal.koreanGivenName = "사용자";
  profile.contact.phoneNumber = "01012345678";
  profile.contact.email = "synthetic@example.test";
  const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) =>
    registrationAnalysis(request),
  );
  const stage = vi.fn();
  const title = vi.fn();
  const analyze = createAnalyzeFields({
    adapter: {
      ...getWorkflowAdapter(document),
      stateDriverStage: (_item, handle) =>
        ["name", "mobile", "email"].indexOf(
          handle.candidate.domName!.split(".").at(-1)!,
        ),
    },
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("Unexpected preparation");
      },
      analyzeFields: fields,
    },
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    setAddressResult: () => undefined,
    setExceptionTitle: title,
    setStage: stage,
    setFieldsSnapshot: () => undefined,
    setReviewItems: () => undefined,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: () => undefined,
  });
  try {
    await analyze(profile);
    expect(fields).toHaveBeenCalledTimes(3);
    expect(stage).toHaveBeenLastCalledWith("exception");
    expect(title).toHaveBeenLastCalledWith(
      "에이치닷 입력 분석 한도에 도달했습니다. 남은 항목을 직접 확인해 주세요",
    );
    expect(validation.clicks()).toBe(0);
  } finally {
    validation.dispose();
  }
});

it("shares the Hplace request limit across analysis factories in the same workflow run", async () => {
  mountHplaceRegistration();
  const profile = createEmptyProfile();
  const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) =>
    registrationAnalysis(request),
  );
  const stage = vi.fn();
  const context = {
    adapter: getWorkflowAdapter(document),
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("Unexpected preparation");
      },
      analyzeFields: fields,
    },
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set<string>() },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set<Element>() },
    setAddressResult: () => undefined,
    setExceptionTitle: () => undefined,
    setStage: stage,
    setFieldsSnapshot: () => undefined,
    setReviewItems: () => undefined,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: () => undefined,
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    await createAnalyzeFields(context)(profile);
  }
  expect(fields).toHaveBeenCalledTimes(3);
  expect(stage).toHaveBeenLastCalledWith("exception");
  context.addressRun.current = { controller: new AbortController() };
  await createAnalyzeFields(context)(profile);
  expect(fields).toHaveBeenCalledTimes(4);
  expect(stage).toHaveBeenLastCalledWith("result");
});
