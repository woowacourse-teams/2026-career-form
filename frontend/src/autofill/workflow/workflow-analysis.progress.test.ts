import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { getWorkflowAdapter } from "../adapters/workflow";
import type { ApprovedWriteResult } from "../write/executor";
import { createProgressTracker, type WriteProgress } from "./progress-model";
import { createAnalyzeFields } from "./workflow-analysis";

afterEach(() => document.body.replaceChildren());

async function analyzePartiallyFailingDrivers(
  failure: "write" | "settle" | "readiness",
) {
  document.body.innerHTML = `
    <fieldset><label>국문 성<input name="family" /></label></fieldset>
    <fieldset><label>국문 이름<input name="given" /></label></fieldset>`;
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "테스트";
  profile.personal.koreanGivenName = "사용자";
  const tracker = createProgressTracker();
  let progress: WriteProgress[] = [];
  let results: ApprovedWriteResult[] = [];
  const analyze = createAnalyzeFields({
    adapter: {
      ...getWorkflowAdapter("example.test"),
      stateDriverStage: () => 1,
      waitForStateDriverReady: async (_document, handle) =>
        failure !== "readiness" || handle.candidate.domName === "family",
      executeStateDriver: async (_document, handle) =>
        failure === "write" && handle.candidate.domName === "given"
          ? false
          : undefined,
      settleStateDriver: async (_document, handle) =>
        failure !== "settle" || handle.candidate.domName === "family",
      stateDriverFailureGroup: (_item, handle) =>
        handle.elements[0]?.closest("fieldset") ?? undefined,
    },
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("Preparation is not part of this test");
      },
      analyzeFields: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey:
                field.domName === "family"
                  ? "personal.personal.koreanFamilyName"
                  : "personal.personal.koreanGivenName",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          })),
      }),
    },
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    completedDriverKeys: { current: new Set() },
    deferredDriverGroups: { current: new Set() },
    setAddressResult: () => undefined,
    setExceptionTitle: () => undefined,
    setStage: () => undefined,
    setFieldsSnapshot: () => undefined,
    setReviewItems: () => undefined,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: (next) => {
      results = typeof next === "function" ? next(results) : next;
    },
    onWriteResult: (item, result, registry) => {
      progress = tracker.record(item, result, registry);
    },
  });

  await analyze(profile);
  return { progress, results };
}

it.each(["write", "settle"] as const)(
  "retains a verified driver's completed progress when another driver fails %s",
  async (failure) => {
    const { progress, results } = await analyzePartiallyFailingDrivers(failure);

    expect(
      document.querySelector<HTMLInputElement>("[name='family']")?.value,
    ).toBe("테스트");
    expect(
      results.filter((result) => result.status === "written"),
    ).toHaveLength(1);
    expect(progress).toEqual([
      {
        id: expect.any(String),
        label: "국문 성",
        category: "기본 인적사항",
        status: "written",
      },
    ]);
  },
);

it("does not report a ready but unexecuted driver as completed", async () => {
  const { progress } = await analyzePartiallyFailingDrivers("readiness");

  expect(
    document.querySelector<HTMLInputElement>("[name='family']")?.value,
  ).toBe("");
  expect(progress).toEqual([]);
});
