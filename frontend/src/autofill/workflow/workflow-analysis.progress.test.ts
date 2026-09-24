import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { getWorkflowAdapter } from "../adapters/workflow";
import type { ApprovedWriteResult } from "../write/executor";
import { createProgressTracker, type WriteProgress } from "./progress-model";
import { createAnalyzeFields } from "./workflow-analysis";
import { buildResultModel } from "./result-model";
import type { ReviewPlanItem } from "../review/review-plan";
import type { collectFieldsSnapshot } from "../dom/collect";

afterEach(() => document.body.replaceChildren());

async function analyzePartiallyFailingDrivers(
  failure: "write" | "settle" | "readiness",
  sameGroup = false,
) {
  document.body.innerHTML = `
    <fieldset><label>국문 성<input name="family" /></label></fieldset>
    <fieldset><label>국문 이름<input name="given" /></label><label>연락처<input name="dependent" /></label></fieldset>`;
  if (sameGroup) {
    const groups = document.querySelectorAll("fieldset");
    groups[1].prepend(...groups[0].childNodes);
    groups[0].remove();
  }
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "테스트";
  profile.personal.koreanGivenName = "사용자";
  const tracker = createProgressTracker();
  let progress: WriteProgress[] = [];
  let results: ApprovedWriteResult[] = [];
  let reviewItems: ReviewPlanItem[] = [];
  let snapshot: ReturnType<typeof collectFieldsSnapshot> | undefined;
  const analyze = createAnalyzeFields({
    adapter: {
      ...getWorkflowAdapter("example.test"),
      stateDriverStage: (_item, handle) =>
        handle.candidate.domName === "dependent"
          ? undefined
          : sameGroup && handle.candidate.domName === "given"
            ? 2
            : 1,
      waitForStateDriverReady: async (_document, handle, report) => {
        if (failure !== "readiness" || handle.candidate.domName === "family")
          return true;
        report?.("SEARCH_TIMEOUT");
        return false;
      },
      executeStateDriver: async (_document, handle, _item, _signal, report) => {
        if (failure !== "write" || handle.candidate.domName !== "given")
          return undefined;
        report?.("SEARCH_NO_RESULTS");
        return false;
      },
      settleStateDriver: async (_document, handle, report) => {
        if (failure !== "settle" || handle.candidate.domName === "family")
          return true;
        report?.("EXAM_SCORE_NOT_READY");
        return false;
      },
      stateDriverFailureGroup: (_item, handle) =>
        handle.elements[0]?.closest("fieldset") ?? undefined,
    },
    completedGenericStateDrivers: { current: new Map() },
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
    setFieldsSnapshot: (next) => {
      snapshot = typeof next === "function" ? next(snapshot) : next;
    },
    setReviewItems: (next) => {
      reviewItems = typeof next === "function" ? next(reviewItems) : next;
    },
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
  const registry = snapshot!.registry;
  const resultModel = buildResultModel({
    profile,
    reviewItems,
    results,
    progress,
    wasWritten: (id) => tracker.wasWritten(id, registry),
    progressIdFor: (id) => tracker.progressIdFor(id, registry),
    progressStateFor: tracker.progressStateFor,
  });
  return { progress, results, resultModel };
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
    expect(progress.filter((entry) => entry.status === "written")).toEqual([
      {
        id: expect.any(String),
        candidateId: expect.any(String),
        label: "국문 성",
        category: "기본 인적사항",
        status: "written",
        unchanged: false,
      },
    ]);
  },
);

it("does not report a ready but unexecuted driver as completed", async () => {
  const { progress } = await analyzePartiallyFailingDrivers("readiness");

  expect(
    document.querySelector<HTMLInputElement>("[name='family']")?.value,
  ).toBe("");
  expect(progress.filter((entry) => entry.status === "written")).toEqual([]);
});

it.each([
  ["write", "SEARCH_NO_RESULTS"],
  ["settle", "EXAM_SCORE_NOT_READY"],
  ["readiness", "SEARCH_TIMEOUT"],
] as const)(
  "preserves %s failure evidence only for the source field and reports its dependent separately",
  async (failure, code) => {
    const { results, progress } = await analyzePartiallyFailingDrivers(failure);
    expect(results.filter((result) => result.status === "skipped")).toEqual([
      expect.objectContaining({ failureCode: code }),
      expect.objectContaining({ failureCode: "ROW_SEARCH_UNCONFIRMED" }),
    ]);
    expect(progress.filter((entry) => entry.status === "skipped")).toEqual([
      expect.objectContaining({ label: "국문 이름", failureCode: code }),
    ]);
  },
);

it("keeps a driver with matching text pending when its required follow-up control was not ready", async () => {
  const { resultModel } = await analyzePartiallyFailingDrivers("settle");

  expect(document.querySelector<HTMLInputElement>("[name=given]")!.value).toBe(
    "사용자",
  );
  expect(resultModel.pending).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ failureCode: "EXAM_SCORE_NOT_READY" }),
    ]),
  );
  expect(resultModel.skipped).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        item: expect.objectContaining({
          profileFieldKey: "personal.personal.koreanGivenName",
        }),
      }),
    ]),
  );
});

it("preserves a completed driver's write evidence when a later search fails in the same group", async () => {
  const { progress, resultModel } = await analyzePartiallyFailingDrivers(
    "settle",
    true,
  );

  expect(document.querySelector<HTMLInputElement>("[name=family]")!.value).toBe(
    "테스트",
  );
  expect(progress.find((entry) => entry.label === "국문 성")).toMatchObject({
    status: "written",
    unchanged: false,
  });
  expect(
    resultModel.pending.find((entry) => entry.item?.fieldLabel === "국문 성"),
  ).toMatchObject({ written: true });
});
