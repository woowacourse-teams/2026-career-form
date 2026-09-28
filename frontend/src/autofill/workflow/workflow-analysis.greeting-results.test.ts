import { beforeEach as useGreetingHost } from "vitest";
useGreetingHost(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://kakaomobility.career.greetinghr.com/ko/o/1/apply",
  });
});
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { getWorkflowAdapter } from "../adapters/workflow";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { createProgressTracker, type WriteProgress } from "./progress-model";
import { resultFieldState } from "./result-field-state";
import { buildResultModel } from "./result-model";
import { createAnalyzeFields } from "./workflow-analysis";

let modalEvents: AbortController | undefined;
afterEach(() => {
  modalEvents?.abort();
  document.body.replaceChildren();
});

async function run(
  mode:
    | "remount"
    | "renumber"
    | "lost-value"
    | "unrecorded"
    | "duplicate"
    | "normalized-veteran"
    | "search-selection-lost"
    | "search-selection-retained"
    | "search-selection-profile-changed"
    | "search-selection-modal",
) {
  document.body.innerHTML =
    '<label>국문 성<input name="driver"></label><label>국문 이름<input name="ordinary"></label>';
  const driver = document.querySelector<HTMLInputElement>('[name="driver"]')!;
  const ordinary =
    document.querySelector<HTMLInputElement>('[name="ordinary"]')!;
  const searchSelection = mode.startsWith("search-selection-");
  const driverName = searchSelection
    ? "educationalBackground.universities.0.schoolName"
    : mode === "normalized-veteran"
      ? "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber"
      : "driver";
  driver.name = driverName;
  const driverKey =
    mode === "normalized-veteran"
      ? "veteran.veteran.veteranNumber"
      : "personal.personal.koreanFamilyName";
  const profile = createEmptyProfile();
  profile.veteran.veteranNumber = "12-345678";
  profile.personal.koreanFamilyName = "가상";
  profile.personal.koreanGivenName = "사용자";
  if (mode === "unrecorded") driver.value = "가상";
  ordinary.addEventListener("input", () => {
    queueMicrotask(() => {
      const replacement = driver.cloneNode(true) as HTMLInputElement;
      if (mode === "lost-value") replacement.value = "";
      if (mode === "search-selection-lost")
        replacement.removeAttribute("data-selected-code");
      driver.replaceWith(replacement);
      ordinary.replaceWith(ordinary.cloneNode(true));
      if (mode === "duplicate") replacement.after(replacement.cloneNode(true));
    });
  });
  if (mode === "search-selection-modal") {
    modalEvents = new AbortController();
    driver.setAttribute("data-scope", "combobox");
    driver.setAttribute("data-part", "input");
    driver.setAttribute("role", "combobox");
    driver.setAttribute("aria-controls", "school-popup");
    driver.setAttribute("aria-expanded", "false");
    document.addEventListener(
      "click",
      (event) => {
        if (
          !(event.target instanceof HTMLInputElement) ||
          event.target.name !== driverName
        )
          return;
        event.target.setAttribute("aria-expanded", "true");
        document
          .querySelector('[name="ordinary"]')
          ?.parentElement?.setAttribute("aria-hidden", "true");
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div data-scope="combobox" data-part="positioner"><div data-scope="scroll-area" data-part="root"><div id="school-popup" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div data-scope="combobox" data-part="item" role="option" data-state="checked" data-value="school-1">가상</div></div></div></div>',
        );
      },
      { signal: modalEvents.signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Escape" ||
          !(event.target instanceof HTMLInputElement) ||
          event.target.name !== driverName
        )
          return;
        event.target.setAttribute("aria-expanded", "false");
        document
          .querySelector('[name="ordinary"]')
          ?.parentElement?.removeAttribute("aria-hidden");
        document
          .getElementById("school-popup")
          ?.parentElement?.parentElement?.remove();
      },
      { signal: modalEvents.signal },
    );
  }
  let profileChanged = false;
  const tracker = createProgressTracker();
  let progress: WriteProgress[] = [];
  let results: ApprovedWriteResult[] = [];
  let items: ReviewPlanItem[] = [];
  let resultRegistry: CandidateRegistry | undefined;
  const analyze = createAnalyzeFields({
    adapter: {
      ...getWorkflowAdapter("example.test"),
      stateDriverStage: (_item, handle) =>
        handle.candidate.domName === driverName ? 1 : undefined,
      executeStateDriver: async (
        _document,
        handle,
        item,
        _signal,
        _failure,
        beforeMutation,
      ) => {
        if (searchSelection && handle.elements[0].value) {
          if (mode === "search-selection-modal")
            return greetingWorkflowAdapter.executeStateDriver!(
              _document,
              handle,
              item,
              _signal,
              _failure,
              beforeMutation,
            );
          if (mode === "search-selection-profile-changed")
            profileChanged = true;
          return (
            (await beforeMutation?.()) !== false &&
            handle.elements[0].getAttribute("data-selected-code") === "school-1"
          );
        }
        if (searchSelection)
          handle.elements[0].setAttribute("data-selected-code", "school-1");
        handle.elements[0].value =
          mode === "normalized-veteran"
            ? item.profileValue!.replace("-", "")
            : item.profileValue!;
        if (mode === "renumber")
          document.body.insertAdjacentHTML(
            "afterbegin",
            '<input name="ignored">',
          );
        return true;
      },
    },
    pageDocument: document,
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    repository: {
      load: async () => (profileChanged ? createEmptyProfile() : profile),
    },
    approvedSensitiveValues: {
      current: new Map([["veteran.veteran.veteranNumber", "12-345678"]]),
    },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: {
      current: new Set(
        mode === "unrecorded"
          ? ["item-single|personal.personal.koreanFamilyName|driver"]
          : [],
      ),
    },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("unexpected");
      },
      analyzeFields: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        fields: request.sections
          .flatMap((section) => section.fields)
          .filter((field) => field.domName !== "ignored")
          .map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey:
                field.domName === driverName
                  ? driverKey
                  : "personal.personal.koreanGivenName",
            },
            writePlan: {
              command:
                searchSelection && field.domName === driverName
                  ? "SEARCH_SELECTION"
                  : "SET_TEXT",
            },
          })),
      }),
    },
    setAddressResult: () => {},
    setExceptionTitle: () => {},
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
  return { results, items, model, resultRegistry };
}

it.each(["remount", "renumber"] as const)(
  "keeps driver receipts and final ordinary writes completed after Greeting %s",
  async (mode) => {
    const { model, resultRegistry, results } = await run(mode);
    expect(resultRegistry).toBeDefined();
    expect(
      results.filter((result) => result.status === "written"),
    ).toHaveLength(2);
    expect(model.completed).toHaveLength(2);
    expect(model.pending).toEqual([]);
  },
);

it("does not infer a successful Greeting write from completed state-driver keys alone", async () => {
  const { results, items } = await run("unrecorded");
  const driver = items.find(
    (item) => item.profileFieldKey === "personal.personal.koreanFamilyName",
  )!;
  expect(
    results.find((result) => result.candidateId === driver.candidateId)?.status,
  ).toBe("skipped");
});

it.each(["lost-value", "duplicate"] as const)(
  "does not retain a Greeting driver completion after %s",
  async (mode) => {
    const { results, items, model } = await run(mode);
    const driver = items.find(
      (item) => item.profileFieldKey === "personal.personal.koreanFamilyName",
    )!;
    expect(
      results.find((result) => result.candidateId === driver.candidateId)
        ?.status,
    ).toBe("skipped");
    expect(
      model.completed.filter((entry) => entry.label === "국문 성"),
    ).toEqual([]);
  },
);

it("retains a verified driver receipt when the Greeting veteran number display drops its hyphen", async () => {
  const { model, results } = await run("normalized-veteran");
  expect(results.filter((result) => result.status === "written")).toHaveLength(
    2,
  );
  expect(model.completed).toHaveLength(2);
  expect(model.pending).toEqual([]);
});

// The mock adapter models selected-option proof independently of display text.
it("rejects a rebound Greeting search label whose selected option was lost", async () => {
  const { results, items, model } = await run("search-selection-lost");
  const school = items.find(
    (item) => item.profileFieldKey === "personal.personal.koreanFamilyName",
  )!;
  expect(
    results.find((result) => result.candidateId === school.candidateId),
  ).toMatchObject({
    status: "skipped",
    code: "RETAINED_VALUE_UNCONFIRMED",
  });
  expect(model.completed.filter((entry) => entry.label === "국문 성")).toEqual(
    [],
  );
});

it("keeps a rebound Greeting search selection when the adapter confirms its code", async () => {
  const { model, results } = await run("search-selection-retained");
  expect(results.filter((result) => result.status === "written")).toHaveLength(
    2,
  );
  expect(model.completed).toHaveLength(2);
});

it("rejects retained Greeting search proof if the profile changes during revalidation", async () => {
  const { results, items } = await run("search-selection-profile-changed");
  const school = items.find(
    (item) => item.profileFieldKey === "personal.personal.koreanFamilyName",
  )!;
  expect(
    results.find((result) => result.candidateId === school.candidateId)?.status,
  ).toBe("skipped");
});

it("keeps the full Greeting result count after retained-search verification opens a modal", async () => {
  const { model, results } = await run("search-selection-modal");
  expect(results.filter((result) => result.status === "written")).toHaveLength(
    2,
  );
  expect(model.completed).toHaveLength(2);
  expect(model.pending).toEqual([]);
});
