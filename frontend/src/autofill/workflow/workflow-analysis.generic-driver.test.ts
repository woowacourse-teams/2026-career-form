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

const PROFILE_KEYS: Record<string, string> = {
  nationality: "personal.personal.nationality",
  familyA: "personal.personal.koreanFamilyName",
  independent: "personal.personal.koreanGivenName",
  gender: "personal.personal.gender",
  givenC: "personal.personal.englishGivenName",
};

async function analyzeConditionalSelects(
  failure: "unmatched" | "retained-unconfirmed",
) {
  document.body.innerHTML = `
    <label>국적<select name="nationality" aria-controls="regionA">
      <option value="">선택</option><option value="us">미국</option><option value="jp">일본</option>
    </select></label>
    <div id="regionA"><label>국문 성<input name="familyA" /></label></div>
    <label>국문 이름<input name="independent" /></label>
    <label>성별<select name="gender" aria-controls="regionC">
      <option value="">선택</option><option value="m">남성</option><option value="f">여성</option>
    </select></label>
    <div id="regionC"><label>영문 이름<input name="givenC" /></label></div>`;
  if (failure === "retained-unconfirmed") {
    // The page rewrites the chosen value, so the write cannot be confirmed.
    const select =
      document.querySelector<HTMLSelectElement>("[name=nationality]")!;
    select.addEventListener("change", () => {
      select.value = "";
    });
  }
  const profile = createEmptyProfile();
  profile.personal.nationality = failure === "unmatched" ? "대한민국" : "미국";
  profile.personal.koreanFamilyName = "테스트";
  profile.personal.koreanGivenName = "사용자";
  profile.personal.gender = "여성";
  profile.personal.englishGivenName = "Tester";
  const tracker = createProgressTracker();
  let progress: WriteProgress[] = [];
  let results: ApprovedWriteResult[] = [];
  let reviewItems: ReviewPlanItem[] = [];
  let snapshot: ReturnType<typeof collectFieldsSnapshot> | undefined;
  const stages: string[] = [];
  const analyze = createAnalyzeFields({
    adapter: getWorkflowAdapter("example.test"),
    completedGenericStateDrivers: { current: new Map() },
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("Preparation is not part of this test");
      },
      analyzeFields: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .filter((field) => field.domName && PROFILE_KEYS[field.domName])
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: PROFILE_KEYS[field.domName!],
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: {
              command:
                field.domName === "nationality" || field.domName === "gender"
                  ? "SELECT_OPTION"
                  : "SET_TEXT",
            },
          })),
      }),
    },
    pageDocument: document,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    deferredDriverGroups: { current: new Set() },
    setAddressResult: () => undefined,
    setExceptionTitle: () => undefined,
    setStage: (stage) => {
      if (typeof stage === "string") stages.push(stage);
    },
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
  const domNameOf = (candidateId: string) => {
    const lookup = registry.lookupField(candidateId);
    return "handle" in lookup ? lookup.handle.candidate.domName : undefined;
  };
  const resultModel = buildResultModel({
    profile,
    reviewItems,
    results,
    progress,
    wasWritten: (id) => tracker.wasWritten(id, registry),
    progressIdFor: (id) => tracker.progressIdFor(id, registry),
    progressStateFor: tracker.progressStateFor,
  });
  return { stages, results, progress, resultModel, domNameOf };
}

const value = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name=${name}]`,
  )!.value;

it("skips only a conditional select without a matching option and its controlled region", async () => {
  const { stages, results, progress, domNameOf } =
    await analyzeConditionalSelects("unmatched");

  expect(stages).not.toContain("exception");
  expect(stages.at(-1)).toBe("result");
  expect(value("nationality")).toBe("");
  expect(value("familyA")).toBe("");
  expect(value("independent")).toBe("사용자");
  expect(value("gender")).toBe("f");
  expect(value("givenC")).toBe("Tester");
  const skippedNames = results
    .filter((result) => result.status === "skipped")
    .map((result) => domNameOf(result.candidateId) ?? "")
    .sort();
  expect(skippedNames).toEqual(["familyA", "nationality"]);
  const byName = (name: string) =>
    results.find((result) => domNameOf(result.candidateId) === name);
  expect(byName("nationality")).toMatchObject({
    failureCode: "OPTION_UNMATCHED",
    reason: expect.stringContaining("일치하는 항목을 찾지 못해"),
  });
  expect(byName("familyA")).toMatchObject({
    reason: expect.stringContaining("연결된 입력란"),
  });
  expect(JSON.stringify(results)).not.toContain("대한민국");
  expect(
    progress
      .filter((entry) => entry.status === "written")
      .map((entry) => domNameOf(entry.candidateId ?? "") ?? "")
      .sort(),
  ).toEqual(["gender", "givenC", "independent"]);
});

it("keeps the previous behavior when a conditional select cannot be confirmed after writing", async () => {
  const { stages, results, progress, domNameOf } =
    await analyzeConditionalSelects("retained-unconfirmed");

  expect(stages.at(-1)).toBe("result");
  expect(value("familyA")).toBe("");
  expect(value("independent")).toBe("");
  expect(progress.filter((entry) => entry.status === "written")).toEqual([]);
  expect(
    results.find((result) => domNameOf(result.candidateId) === "nationality"),
  ).toMatchObject({
    status: "skipped",
    code: "RETAINED_VALUE_UNCONFIRMED",
  });
});
