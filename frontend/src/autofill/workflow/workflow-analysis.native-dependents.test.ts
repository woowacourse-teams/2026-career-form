/**
 * CF-177 C11 (F7 3, F2 "Also"): a non-search native driver whose own value is
 * verified is written even when its dependents stay disabled; the withheld
 * dependents carry ROW_DRIVER_UNCONFIRMED (never the driver's own code), and a
 * dependent the run could not collect gets a fixed-id visible row with the
 * profile preview. Synthetic DOM and values only.
 */
import { afterEach, expect, it, vi } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import {
  careerEntries,
  mountCareer,
} from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import { nativeFieldsAnalysis } from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import { createAnalyzeFields } from "./workflow-analysis";
import { buildResultModel } from "./result-model";
import type { Stage } from "./workflow-model";

afterEach(() => {
  vi.restoreAllMocks();
  disposeLinkedForms();
  resetHplacePage();
  installExecutionPolicy(document);
});

type MutableNativeForm = {
  sections: { fields: { driver?: { timeoutMs: number } | null }[] }[];
};

/** One career row whose `stuck` control never leaves its disabled state. */
function careerPage(stuck: string): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountCareer(1);
  for (const section of (
    policy.browserPolicy as unknown as { nativeForm: MutableNativeForm }
  ).nativeForm.sections)
    for (const field of section.fields)
      if (field.driver) field.driver.timeoutMs = 200;
  installExecutionPolicy(document, policy);
  document
    .querySelector(`[name="career[0].${stuck}"]`)!
    .removeAttribute("data-rel-target");
  return policy;
}

function profileWithOneCareer(): Profile {
  const profile = createEmptyProfile();
  profile.careers = careerEntries().slice(0, 1);
  return profile;
}

interface Run {
  stages: Stage[];
  results: ApprovedWriteResult[];
  reviewItems: ReviewPlanItem[];
  writes: { name: string; result: ApprovedWriteResult }[];
  nameOf(candidateId: string): string | undefined;
  profile: Profile;
}

const nameIn = (registry: CandidateRegistry, candidateId: string) => {
  const lookup = registry.lookupField(candidateId);
  return "handle" in lookup
    ? (lookup.handle.elements[0]?.getAttribute("name") ?? undefined)
    : undefined;
};

async function run(policy: ExecutionPolicy): Promise<Run> {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const profile = profileWithOneCareer();
  let registry: CandidateRegistry | undefined;
  const recorded: Run = {
    stages: [],
    results: [],
    reviewItems: [],
    writes: [],
    nameOf: (id) => (registry ? nameIn(registry, id) : undefined),
    profile,
  };
  const analyze = createAnalyzeFields({
    adapter: getWorkflowAdapter(document),
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
        async (request) => nativeFieldsAnalysis(request, policy),
      ),
      analyzePreparation: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
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
    setExceptionTitle: () => undefined,
    setStage: (next) => {
      recorded.stages.push(
        typeof next === "function" ? next(recorded.stages.at(-1)!) : next,
      );
    },
    setFieldsSnapshot: (next) => {
      if (next && typeof next !== "function") registry = next.registry;
    },
    setReviewItems: (next) => {
      recorded.reviewItems =
        typeof next === "function" ? next(recorded.reviewItems) : next;
    },
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: (next) => {
      recorded.results =
        typeof next === "function" ? next(recorded.results) : next;
    },
    onWriteResult: (item, result, source) => {
      recorded.writes.push({
        name: nameIn(source, item.candidateId) ?? item.candidateId,
        result,
      });
    },
  });
  await analyze(profile);
  return recorded;
}

const resultFor = (r: Run, name: string) =>
  r.results.find((result) => r.nameOf(result.candidateId) === name);
const reviewFor = (r: Run, name: string) =>
  r.reviewItems.find((item) => r.nameOf(item.candidateId) === name);

it("writes a verified radio driver and gives its disabled dependent a driver-row", async () => {
  const r = await run(careerPage("leavingDate"));
  expect(r.stages.at(-1)).toBe("result");
  const radio = document.querySelector<HTMLInputElement>(
    '[name="career[0].workingStatusCode"][value="LEAVE"]',
  )!;
  expect(radio.checked).toBe(true);
  // The radio driver itself is written, not reported with its settle failure.
  expect(resultFor(r, "career[0].workingStatusCode")).toEqual(
    expect.objectContaining({ status: "written" }),
  );
  expect(
    r.writes
      .filter((w) => w.name === "career[0].workingStatusCode")
      .map((w) => w.result.status),
  ).toEqual(["written"]);
  // The never-enabled leaving date has no candidate; a fixed-id row shows it.
  const rows = r.reviewItems.filter(
    (item) => item.profileFieldKey === "careers.career.endDate",
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toEqual(
    expect.objectContaining({
      candidateId: "native-dependent-hplace.mrs2.career.leavingDate-0",
      failureCode: "ROW_DRIVER_UNCONFIRMED",
      profileValue: "2021-02-28",
      previewValue: "2021-02-28",
      status: "unavailable",
      selected: false,
      disabled: true,
      itemIndex: 0,
      profileEntryId: "career-a",
    }),
  );
  expect(rows[0].candidateId).not.toContain("2021");
  const model = buildResultModel({
    reviewItems: r.reviewItems,
    results: r.results,
    profile: r.profile,
  });
  expect(
    model.pending.map((entry) => [entry.item?.candidateId, entry.failureCode]),
  ).toEqual([
    [
      "native-dependent-hplace.mrs2.career.leavingDate-0",
      "ROW_DRIVER_UNCONFIRMED",
    ],
  ]);
});

it("defers collected dependents of a verified select driver as driver rows", async () => {
  const r = await run(careerPage("retirementReason"));
  expect(r.stages.at(-1)).toBe("result");
  expect(resultFor(r, "career[0].careerCriteriaCodeSn")).toEqual(
    expect.objectContaining({ status: "written" }),
  );
  for (const name of ["company", "department", "position", "assignedTask"])
    expect(resultFor(r, `career[0].${name}`)).toEqual(
      expect.objectContaining({
        status: "skipped",
        failureCode: "ROW_DRIVER_UNCONFIRMED",
      }),
    );
  expect(
    document.querySelector<HTMLInputElement>('[name="career[0].company"]')!
      .value,
  ).toBe("");
  expect(reviewFor(r, "career[0].retirementReason")).toBeUndefined();
  expect(
    r.reviewItems.filter(
      (item) => item.failureCode === "ROW_DRIVER_UNCONFIRMED",
    ),
  ).toEqual([
    expect.objectContaining({
      candidateId: "native-dependent-hplace.mrs2.career.retirementReason-0",
      profileFieldKey: "careers.career.terminationReason",
      previewValue: "가상 퇴직사유",
    }),
  ]);
  expect(
    r.results.some(
      (result) =>
        result.status === "skipped" &&
        result.failureCode === "ROW_SEARCH_UNCONFIRMED",
    ),
  ).toBe(false);
});

it("keeps an originally matching value excluded when only a driver in its row failed", () => {
  const item = {
    candidateId: "field-1",
    fieldLabel: "회사명",
    currentValue: "합성회사 A",
    profileValue: "합성회사 A",
    previewValue: "합성회사 A",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "합성",
    profileFieldKey: "careers.career.companyName",
  } satisfies ReviewPlanItem;
  const result = buildResultModel({
    reviewItems: [item],
    results: [
      {
        candidateId: "field-1",
        status: "skipped",
        reason: "row deferred",
        failureCode: "ROW_DRIVER_UNCONFIRMED",
      },
    ],
    progress: [
      {
        id: "stable-1",
        candidateId: "field-1",
        label: "회사명",
        category: "직장경력",
        status: "written",
        unchanged: true,
      },
    ],
    progressIdFor: () => "stable-1",
    wasWritten: () => true,
  });
  expect(result.pending).toEqual([]);
  expect(result.skipped).toMatchObject([{ reason: "기존 값 유지" }]);
});
