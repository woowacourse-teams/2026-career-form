/**
 * Full flow (task 5.1): add a row, prepare both kinds, then search the second
 * row's school name through its role-less layer and select the fragment link.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { PreparationPlan } from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { executeReadonlySearch } from "../interaction/readonly-search-executor";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { prepareMixedSectionRows } from "./mixed-section-preparation";
import {
  createMixedEducationLayerFixture,
  type LayerResponseMode,
  type LayerResult,
  type MixedEducationLayerFixture,
} from "./test-utils/mixed-education-layer.fixture";
import { localItemCount } from "./workflow-model";

type AddPlan = Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>;

const SCHOOL = "<대학교명>";
const data: Profile = {
  ...createEmptyProfile(),
  education: [
    {
      id: "entry-0",
      sectionId: "highSchool",
      values: { schoolName: "<고등학교명>" },
    },
    {
      id: "entry-1",
      sectionId: "university",
      values: { schoolType: "대학교", schoolName: SCHOOL },
    },
  ],
};

let fixture: MixedEducationLayerFixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  vi.useRealTimers();
});

function preparationView() {
  const collected = collectPreparationSnapshot(document);
  return {
    collected,
    execution: {
      registry: collected.registry,
      isTargetSectionVisible: () => true,
      countRepeatableGroups: (plan: AddPlan) =>
        collected.countRepeatableGroups(plan.actionCandidateId),
      repeatableGroupState: (plan: AddPlan) =>
        collected.repeatableGroupState(plan.actionCandidateId),
    },
  };
}

async function prepare(
  mode: LayerResponseMode,
  results: readonly LayerResult[],
  form: { applicationForm?: boolean; layerSearchSubmitsForm?: boolean } = {},
) {
  fixture = createMixedEducationLayerFixture({
    rows: [{ highSchoolName: "<보존값>", highSchoolCode: "<보존코드>" }],
    results,
    responseMode: mode,
    ...form,
  });
  const initial = preparationView();
  const action = initial.collected.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.displayName === "내용추가")!;
  const plan: AddPlan = {
    actionCandidateId: action.candidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  };
  const count = localItemCount(plan, initial.collected, data);
  expect(count).toBe(2);
  await executeApprovedPreparationPlans({
    approvedPlans: [{ plan, approved: true, localItemCount: count! }],
    initialSnapshot: initial.execution,
    refreshSnapshot: async () => preparationView().execution,
    countRepeatableGroups: (snapshot, current) =>
      snapshot.countRepeatableGroups?.(current) ?? Number.NaN,
  });
  const kinds = await prepareMixedSectionRows({
    document,
    profile: data,
    signal: new AbortController().signal,
    recordOperation: () => {},
  });
  expect(kinds).toEqual(["selected", "selected"]);
}

async function searchSecondRow() {
  const branch = fixture!.row(1).branch("college");
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" &&
        lookup.handle.elements[0] === branch.schoolName
      );
    });
  expect(candidate).toBeDefined();
  vi.useFakeTimers();
  const pending = executeReadonlySearch({
    document,
    registry: snapshot.registry,
    targetCandidateId: candidate!.candidateId,
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: SCHOOL,
    expectedCurrentValue: "",
  });
  await vi.runAllTimersAsync();
  return { branch, result: await pending };
}

function expectUntouched(selected: boolean) {
  const first = fixture!.row(0);
  expect(first.branch("high").schoolName.value).toBe("<보존값>");
  expect(first.branch("high").schoolCode.value).toBe("<보존코드>");
  expect(
    fixture!.events.filter(
      (event) =>
        "row" in event && event.row === 0 && event.type !== "kind-change",
    ),
  ).toEqual([]);
  const selects = fixture!.events.filter((event) => event.type === "select");
  expect(selects).toEqual(
    selected
      ? [expect.objectContaining({ row: 1, name: SCHOOL, manual: false })]
      : [],
  );
  expect(
    fixture!.events.filter((event) => event.type === "manual-toggle"),
  ).toEqual([]);
  expect(fixture!.row(1).branch("college").manualInput.value).toBe("");
}

describe("mixed education layer search (task 5.1)", () => {
  it("selects the second row's school through the role-less layer", async () => {
    await prepare("sync-replace", [
      { name: SCHOOL, code: "<학교코드>" },
      { name: "<다른학교>", code: "<다른코드>" },
    ]);
    const urlBefore = document.URL;
    const { branch, result } = await searchSecondRow();

    expect(result).toMatchObject({ status: "selected" });
    expect(branch.schoolName.value).toBe(SCHOOL);
    expect(
      branch.layer.hidden || getComputedStyle(branch.layer).display === "none",
    ).toBe(true);
    expect(new URL(document.URL).pathname).toBe(new URL(urlBefore).pathname);
    expectUntouched(true);
  }, 30_000);

  it("selects through the layer when the whole application is one form", async () => {
    await prepare("sync-replace", [{ name: SCHOOL, code: "<학교코드>" }], {
      applicationForm: true,
    });
    const layerSubmit = fixture!.row(1).branch("college").submit;
    expect(layerSubmit.form).not.toBeNull();
    expect(layerSubmit.getAttribute("onclick")).toBeTruthy();
    const { branch, result } = await searchSecondRow();

    expect("reason" in result ? result.reason : undefined).toBeUndefined();
    expect(result).toMatchObject({ status: "selected" });
    expect(branch.schoolName.value).toBe(SCHOOL);
    expect(
      fixture!.events.filter((event) => event.type === "form-submit"),
    ).toEqual([]);
    expectUntouched(true);
  }, 30_000);

  it("blocks and cancels a form submission started by the layer search button", async () => {
    await prepare("sync-replace", [{ name: SCHOOL, code: "<학교코드>" }], {
      applicationForm: true,
      layerSearchSubmitsForm: true,
    });
    const { result } = await searchSecondRow();

    expect("reason" in result ? result.reason : undefined).toBe(
      "surface_navigation_unsafe",
    );
    // The executor cancels the submit event before the form's handlers run.
    expect(
      fixture!.events.filter((event) => event.type === "form-submit"),
    ).toEqual([]);
    expectUntouched(false);
  }, 30_000);

  it("selects after a chunked replacement", async () => {
    await prepare("chunked-replace", [
      { name: "<다른학교>", code: "<다른코드>" },
      { name: SCHOOL, code: "<학교코드>" },
    ]);
    const { result } = await searchSecondRow();
    expect(result).toMatchObject({ status: "selected" });
    expectUntouched(true);
  }, 30_000);

  it.each([
    [
      "zero-no-mutation",
      [{ name: SCHOOL, code: "<학교코드>" }],
      "result_pending",
      false,
    ],
    [
      "append-only",
      [{ name: SCHOOL, code: "<학교코드>" }],
      "result_pending",
      true,
    ],
    [
      "zero-notice-contradiction",
      [{ name: SCHOOL, code: "<학교코드>" }],
      "result_set_incomplete",
      false,
    ],
    [
      "sync-replace",
      [{ name: "<다른학교>", code: "<다른코드>" }],
      "search_results_not_found",
      false,
    ],
  ] as const)(
    "%s ends with the expected reason",
    async (mode, results, reason, prefill) => {
      await prepare(mode, results);
      if (prefill) {
        const item = document.createElement("li");
        item.innerHTML =
          '<a href="#n" onclick="return true;">&lt;이전학교&gt;</a>';
        fixture!.row(1).branch("college").list.append(item);
      }
      const { result } = await searchSecondRow();
      expect("reason" in result ? result.reason : undefined).toBe(reason);
      expectUntouched(false);
    },
    30_000,
  );
});
