/**
 * CF-177 C2 (F3·F12): native drivers of one stage run as one batch, the last
 * analysis request ends with a report-only result, and every driver pass emits
 * harness-safe diagnostics. Non-native adapters keep the first-failure break.
 * Synthetic DOM and values only.
 */
import { afterEach, expect, it, vi } from "vitest";
import { getWorkflowAdapter, type WorkflowAdapter } from "../adapters/workflow";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import { expectHarnessLine } from "./test-utils/harness-diagnostic-line";
import { nativeFieldsAnalysis } from "./test-utils/hplace-native-workflow";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";
import { createAnalyzeFields } from "./workflow-analysis";
import type { Stage } from "./workflow-model";

afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
  resetHplacePage();
  installExecutionPolicy(document);
});

type MutableNativeForm = {
  maxFieldsRequests: number;
  sections: {
    fields: {
      search?: { timeoutMs: number } | null;
      driver?: { timeoutMs: number } | null;
    }[];
  }[];
};

/** Short search/driver timeouts keep the no-response site fast (contract 1..2000). */
function fastEducation(maxFieldsRequests?: number): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const policy = mountEducation(2, 1, true);
  const form = (
    policy.browserPolicy as unknown as { nativeForm: MutableNativeForm }
  ).nativeForm;
  for (const section of form.sections)
    for (const field of section.fields) {
      if (field.search) field.search.timeoutMs = 40;
      if (field.driver)
        field.driver.timeoutMs = Math.min(field.driver.timeoutMs, 300);
    }
  if (maxFieldsRequests !== undefined)
    form.maxFieldsRequests = maxFieldsRequests;
  installExecutionPolicy(document, policy);
  return policy;
}

interface Recorded {
  stages: Stage[];
  titles: string[];
  results: ApprovedWriteResult[];
  writes: { name: string; result: ApprovedWriteResult }[];
  keypresses: string[];
  lines: string[];
  fields: ReturnType<typeof vi.fn>;
  /** DOM name of a final-pass candidate. */
  nameOf: (candidateId: string) => string;
  resultFor: (name: string) => ApprovedWriteResult | undefined;
}

/** Raw DOM name; a search query has none, so use its widget's hidden name. */
function rawName(element: Element | undefined): string | undefined {
  return (
    element?.getAttribute("name") ??
    element
      ?.closest("div.span")
      ?.querySelector(':scope > input[type="hidden"][name$="Name"]')
      ?.getAttribute("name") ??
    undefined
  );
}

function domName(registry: CandidateRegistry, candidateId: string): string {
  const lookup = registry.lookupField(candidateId);
  if (!("handle" in lookup)) return candidateId;
  return (
    rawName(lookup.handle.elements[0] ?? lookup.handle.customElements?.[0]) ??
    candidateId
  );
}

async function runNative({
  policy,
  profile = educationProfile(),
  adapter = getWorkflowAdapter(document),
  twice = false,
}: {
  policy: ExecutionPolicy;
  profile?: Profile;
  adapter?: WorkflowAdapter;
  twice?: boolean;
}): Promise<Recorded> {
  setAutofillDebugEnabled(true);
  const lines: string[] = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
  vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "table").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const keypresses: string[] = [];
  document.querySelector("#frm")!.addEventListener("keypress", (event) => {
    const query = event.target;
    if (query instanceof HTMLInputElement && query.type === "search")
      keypresses.push(
        `${query.closest("[data-loop=collegeMajor]") ? "major" : "school"}:${
          query
            .closest("[data-loop=college],[data-loop=graduateSchool]")
            ?.getAttribute("data-loop") ?? ""
        }`,
      );
  });
  const recorded: Recorded = {
    stages: [],
    titles: [],
    results: [],
    writes: [],
    keypresses,
    lines,
    fields: vi.fn(),
    nameOf: (id) => id,
    resultFor: () => undefined,
  };
  let registry: CandidateRegistry | undefined;
  const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) =>
    nativeFieldsAnalysis(request, policy),
  );
  recorded.fields = fields;
  const analyze = createAnalyzeFields({
    adapter,
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    apiClient: {
      analyzeFields: fields,
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
    setExceptionTitle: (next) => {
      recorded.titles.push(typeof next === "function" ? next("") : next);
    },
    setStage: (next) => {
      recorded.stages.push(
        typeof next === "function" ? next(recorded.stages.at(-1)!) : next,
      );
    },
    setFieldsSnapshot: (next) => {
      if (next && typeof next !== "function") registry = next.registry;
    },
    setReviewItems: () => undefined,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: (next) => {
      recorded.results =
        typeof next === "function" ? next(recorded.results) : next;
    },
    onWriteResult: (
      item: ReviewPlanItem,
      result: ApprovedWriteResult,
      source: CandidateRegistry,
    ) => {
      recorded.writes.push({ name: domName(source, item.candidateId), result });
    },
  });
  await analyze(profile);
  if (twice) await analyze(profile);
  recorded.nameOf = (id) => (registry ? domName(registry, id) : id);
  recorded.resultFor = (name) =>
    recorded.results.find((r) => recorded.nameOf(r.candidateId) === name);
  return recorded;
}

const SCHOOLS = [
  "college[0].academyName",
  "college[1].academyName",
  "graduateSchool[0].academyName",
];
const MAJORS = [
  "college[0].collegeMajor[0].majorName",
  "college[1].collegeMajor[0].majorName",
  "graduateSchool[0].collegeMajor[0].majorName",
];
const failureCode = (result: ApprovedWriteResult | undefined) =>
  result?.status === "skipped" ? result.failureCode : undefined;
const value = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  )!.value;

it("runs every native driver of a stage in one pass when the site never answers searches", async () => {
  const run = await runNative({ policy: fastEducation() });

  expect(run.titles).toEqual([]);
  expect(run.stages.at(-1)).toBe("result");
  // Stage 1 (degree), 2 (school), 3 (major), 4 (score) and the final pass.
  expect(run.fields.mock.calls.length).toBeLessThanOrEqual(5);
  expect(run.keypresses.filter((k) => k.startsWith("school"))).toHaveLength(3);
  expect(run.keypresses.filter((k) => k.startsWith("major"))).toHaveLength(3);
  for (const name of [...SCHOOLS, ...MAJORS]) {
    const result = run.resultFor(name);
    expect(result, name).toMatchObject({ status: "skipped" });
    expect(failureCode(result), name).toEqual(expect.any(String));
  }
  expect(value("college[0].score")).toBe("3.75");
  expect(value("college[0].perfectScore")).toBe("4.5");
}, 30000);

it("keeps the first-failure break for a non-native adapter", async () => {
  document.body.innerHTML = [1, 2, 3, 4]
    .map(
      (i) =>
        `<fieldset><label>국문 이름 ${i}<input name="given${i}" /></label></fieldset>`,
    )
    .join("");
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성이름";
  const fields = vi.fn<AnalysisApiClient["analyzeFields"]>(async (request) => ({
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
          profileFieldKey: "personal.personal.koreanGivenName",
        },
        autofillPolicy: "ALLOWED",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
      })),
  }));
  const executed: string[] = [];
  let stage: Stage | undefined;
  const analyze = createAnalyzeFields({
    adapter: {
      ...getWorkflowAdapter("example.test"),
      stateDriverStage: () => 1,
      executeStateDriver: async (_document, handle, _item, _signal, report) => {
        executed.push(handle.candidate.domName ?? "");
        report?.("SEARCH_NO_RESULTS");
        return false;
      },
      settleStateDriver: async () => true,
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
      analyzeFields: fields,
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
    setStage: (next) => {
      stage = typeof next === "function" ? next(stage!) : next;
    },
    setFieldsSnapshot: () => undefined,
    setReviewItems: () => undefined,
    setPartial: () => undefined,
    setWarnings: () => undefined,
    setResults: () => undefined,
  });
  await analyze(profile);

  expect(fields).toHaveBeenCalledTimes(5);
  expect(executed).toEqual(["given1", "given2", "given3", "given4"]);
  expect(stage).toBe("result");
});

it("skips a later driver whose controls overlap a failed driver's targets without a result", async () => {
  const policy = fastEducation();
  const base = getWorkflowAdapter(document);
  const executed: string[] = [];
  const overlap = () =>
    Array.from(
      document
        .querySelector('[name="college[1].academyName"]')!
        .closest("div.span")!
        .querySelectorAll("input"),
    );
  const run = await runNative({
    policy,
    adapter: {
      ...base,
      executeStateDriver: (...args) => {
        executed.push(rawName(args[1].elements[0]) ?? "");
        return base.executeStateDriver!(...args);
      },
      stateDriverFailureTargets: (item, handle) => {
        const targets = base.stateDriverFailureTargets?.(item, handle) ?? [];
        return rawName(handle.elements[0]) === "college[0].academyName"
          ? [...targets, ...overlap()]
          : targets;
      },
    },
  });

  expect(run.stages.at(-1)).toBe("result");
  const schools = executed.filter((name) => name.endsWith(".academyName"));
  expect(schools).toEqual([
    "college[0].academyName",
    "graduateSchool[0].academyName",
  ]);
  expect(run.writes.filter((w) => w.name === "college[1].academyName")).toEqual(
    [],
  );
  expect(run.resultFor("college[1].academyName")).toMatchObject({
    status: "skipped",
    failureCode: "ROW_SEARCH_UNCONFIRMED",
  });
  expect(failureCode(run.resultFor("college[0].academyName"))).not.toBe(
    "ROW_SEARCH_UNCONFIRMED",
  );
}, 30000);

it("ends the last allowed analysis request with a report-only result", async () => {
  const run = await runNative({ policy: fastEducation(2) });

  expect(run.titles).toEqual([]);
  expect(run.stages.at(-1)).toBe("result");
  expect(run.fields).toHaveBeenCalledTimes(2);
  expect(run.keypresses).toEqual([]);
  for (const name of SCHOOLS)
    expect(run.resultFor(name), name).toMatchObject({
      status: "skipped",
      failureCode: "DRIVER_LIMIT_REACHED",
    });
  // Stage 1 ran on the first request; only the last one is report-only.
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="college[0].degreeTypeCode"]:checked',
    )?.value,
  ).toBe("50");
  expect(value("college[0].entranceDate")).toBe("");
  expect(value("college[0].score")).toBe("");
  const line =
    "[CareerForm] skip stage=collect key=native-analysis reason=analysis-limit detail=budget";
  expect(run.lines).toContain(line);
  expectHarnessLine(line);
}, 30000);

it("keeps the no-progress exception and reports it as an analysis-limit line", async () => {
  const run = await runNative({ policy: fastEducation(), twice: true });

  expect(run.titles.at(-1)).toBe(
    "입력 분석의 진전을 확인할 수 없습니다. 남은 항목을 직접 확인해 주세요",
  );
  expect(run.stages.at(-1)).toBe("exception");
  const line =
    "[CareerForm] skip stage=collect key=native-analysis reason=analysis-limit detail=no-progress";
  expect(run.lines).toContain(line);
  expectHarnessLine(line);
}, 30000);

it("emits a drivers stage line per pass and a driver-deferred line per failed native driver", async () => {
  const run = await runNative({ policy: fastEducation() });
  const profile = educationProfile();
  const canaries = [
    "합성대학 A",
    "합성대학 B",
    "합성대학원",
    "소프트웨어융합",
    "가상주전공 B",
    "가상연구전공",
  ];
  expect(profile.education.map((e) => e.values.schoolName)).toEqual(
    expect.arrayContaining(["합성대학 A"]),
  );

  const stages = run.lines.filter((l) =>
    l.startsWith("[CareerForm] stage name=drivers "),
  );
  expect(stages).toEqual([
    "[CareerForm] stage name=drivers collected=0 accepted=0 rejected=0 planned=3 executed=3",
    "[CareerForm] stage name=drivers collected=0 accepted=0 rejected=0 planned=3 executed=3",
    "[CareerForm] stage name=drivers collected=0 accepted=0 rejected=0 planned=3 executed=3",
    "[CareerForm] stage name=drivers collected=0 accepted=0 rejected=0 planned=3 executed=3",
  ]);
  const deferred = run.lines.filter((l) =>
    l.includes("reason=driver-deferred"),
  );
  for (const line of [...stages, ...deferred])
    expectHarnessLine(line, canaries);
  for (const line of deferred)
    expect(line).toMatch(
      /^\[CareerForm\] skip stage=write key=hplace\.mrs2\.(college|graduateSchool)\.[A-Za-z0-9.]+ reason=driver-deferred detail=driver-(write|settle|ready) failureCode=[A-Z_]+$/,
    );
  // Every unanswered school and major search is deferred from its own pass.
  expect(
    deferred.filter((l) =>
      /\.academyName reason=driver-deferred detail=driver-write /.test(l),
    ),
  ).toHaveLength(3);
  expect(
    deferred.filter((l) =>
      /\.major0\.majorName reason=driver-deferred detail=driver-write /.test(l),
    ),
  ).toHaveLength(3);
}, 30000);
