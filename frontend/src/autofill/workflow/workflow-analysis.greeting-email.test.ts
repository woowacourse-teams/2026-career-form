import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { installGreetingEmailCloseBridge } from "../interaction/greeting-email-close-bridge";
import { mockGreetingEditingCommand } from "../interaction/test-utils/greeting-email-editing";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { createProgressTracker, type WriteProgress } from "./progress-model";
import { resultFieldState } from "./result-field-state";
import { buildResultModel } from "./result-model";
import { createAnalyzeFields } from "./workflow-analysis";

const originalUrl = document.URL;
afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", originalUrl);
});

async function run(
  mode:
    | "success"
    | "duplicate"
    | "profile-change"
    | "abort"
    | "stale"
    | "url-analysis"
    | "url-present"
    | "abort-load"
    | "abort-present-load",
) {
  document.body.innerHTML = `<input name="driver"><div data-scope="field" data-part="root"><label>이메일주소*</label><input type="email" role="combobox" data-scope="combobox" data-part="input" aria-expanded="false"><button type="button" disabled>이메일 확인</button></div>`;
  const restore = mockGreetingEditingCommand(document);
  installGreetingEmailCloseBridge(document);
  const email = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const confirm = document.querySelector<HTMLButtonElement>("button")!;
  const order: string[] = [];
  email.addEventListener("input", () => {
    order.push("email");
    setTimeout(() => {
      confirm.disabled = false;
      order.push("accepted");
    }, 30);
  });
  const profile = createEmptyProfile();
  profile.contact.email = "example@example.test";
  profile.personal.koreanGivenName = "사용자";
  const controller = new AbortController();
  let analyzed = false;
  let presented = false;
  const exceptions: string[] = [];
  const receipts = { current: new Map() };
  const tracker = createProgressTracker();
  let progress: WriteProgress[] = [];
  let results: ApprovedWriteResult[] = [];
  let items: ReviewPlanItem[] = [];
  let resultRegistry: CandidateRegistry | undefined;
  const analyze = createAnalyzeFields({
    adapter: {
      ...greetingWorkflowAdapter,
      stateDriverStage: (item, handle) =>
        handle.candidate.domName === "driver"
          ? 1
          : greetingWorkflowAdapter.stateDriverStage?.(item, handle),
      executeStateDriver: async (_document, handle, item) => {
        if (handle.candidate.domName !== "driver") return undefined;
        order.push("driver");
        handle.elements[0].value = item.profileValue!;
        return true;
      },
    },
    executionAdapterId: "greeting-v1",
    pageDocument: document,
    addressRun: { current: { controller } },
    addressSearch: async () => false,
    repository: {
      load: async () => {
        if (
          mode === "abort-load" ||
          (mode === "abort-present-load" && presented)
        )
          controller.abort();
        return mode === "profile-change" && analyzed
          ? createEmptyProfile()
          : profile;
      },
    },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    completedGreetingStateDrivers: receipts,
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("unexpected");
      },
      analyzeFields: async (request) => {
        analyzed = true;
        if (mode === "url-analysis") history.replaceState(null, "", "/changed");
        if (mode === "abort") controller.abort();
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          executionAdapterId: "greeting-v1",
          analysisStatus: "COMPLETE",
          fields: request.sections
            .flatMap((section) => section.fields)
            .flatMap((field) =>
              mode === "duplicate" && field.domName === "basicInformation.email"
                ? [field, field]
                : [field],
            )
            .map((field) => ({
              candidateId: field.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              valueBinding: {
                type: "DIRECT",
                profileFieldKey:
                  field.domName === "driver"
                    ? "personal.personal.koreanGivenName"
                    : "contact.contact.email",
              },
              writePlan: { command: "SET_TEXT" },
            })),
        };
      },
    },
    presentField: async () => {
      presented = true;
      if (mode === "url-present") history.replaceState(null, "", "/changed");
      if (mode === "stale") email.remove();
    },
    setAddressResult: () => {},
    setExceptionTitle: (next) => {
      if (typeof next === "string") exceptions.push(next);
    },
    setStage: () => {},
    setFieldsSnapshot: () => {},
    setReviewItems: (next) => {
      items = typeof next === "function" ? next(items) : next;
    },
    setResultRegistry: (next) => {
      resultRegistry = typeof next === "function" ? next(resultRegistry) : next;
    },
    rebindResultProgress: (review, original, fresh) => {
      review.forEach((item) => tracker.rebindWritten(item, original, fresh));
    },
    setPartial: () => {},
    setWarnings: () => {},
    setResults: (next) => {
      results = typeof next === "function" ? next(results) : next;
    },
    onWriteResult: (item, result, registry) => {
      progress = tracker.record(item, result, registry);
    },
  });
  await analyze(profile);
  const model = buildResultModel({
    reviewItems: items,
    results,
    progress,
    profile,
    wasWritten: (id) =>
      !!resultRegistry && tracker.wasWritten(id, resultRegistry),
    progressIdFor: (id) =>
      resultRegistry && tracker.progressIdFor(id, resultRegistry),
    progressStateFor: tracker.progressStateFor,
    fieldStateFor: (id) => resultFieldState(resultRegistry, document, id),
  });
  restore();
  return { results, model, order, receipts, email, exceptions };
}

it("settles email before conditional drivers and accounts for its receipt", async () => {
  const { order, results, receipts } = await run("success");
  expect(order).toEqual(["email", "accepted", "driver"]);
  expect(results).toHaveLength(2);
  expect(results.every((result) => result.status === "written")).toBe(true);
  expect(receipts.current.size).toBe(2);
});
it.each(["profile-change", "abort", "duplicate", "stale"] as const)(
  "fails closed on %s",
  async (mode) => {
    const { order, receipts, email } = await run(mode);
    expect(order).toEqual([]);
    expect(email.value).toBe("");
    expect(receipts.current.size).toBe(0);
  },
);

it.each(["url-analysis", "url-present"] as const)(
  "rejects navigation during %s before writing",
  async (mode) => {
    const { order, receipts, email } = await run(mode);
    expect(order).toEqual([]);
    expect(email.value).toBe("");
    expect(receipts.current.size).toBe(0);
  },
);
it.each(["abort-load", "abort-present-load"] as const)(
  "cancels silently during %s",
  async (mode) => {
    const { order, exceptions } = await run(mode);
    expect(order).toEqual([]);
    expect(exceptions).toEqual([]);
  },
);
