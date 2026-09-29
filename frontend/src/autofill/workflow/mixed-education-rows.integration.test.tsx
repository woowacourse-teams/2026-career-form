import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldsAnalyzeResponse, PreparationPlan } from "../api/types";
import { validateFieldsResponse } from "../api/validate-response";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { buildReviewPlan } from "../review/review-plan";
import { prepareMixedSectionRows } from "./mixed-section-preparation";
import {
  createMixedEducationLayerFixture,
  type MixedEducationLayerFixture,
  type MixedEducationRowOptions,
} from "./test-utils/mixed-education-layer.fixture";
import { localItemCount } from "./workflow-model";

type AddPlan = Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>;

let fixture: MixedEducationLayerFixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  vi.useRealTimers();
});

function profile(...entries: Array<[string, Record<string, string>]>): Profile {
  return {
    ...createEmptyProfile(),
    education: entries.map(([sectionId, values], index) => ({
      id: `entry-${index}`,
      sectionId,
      values,
    })),
  };
}

const highAndUniversity = () =>
  profile(
    ["highSchool", { schoolName: "<고등학교명>" }],
    ["university", { schoolType: "대학교", schoolName: "<대학교명>" }],
  );

function preparationView(document: Document) {
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

async function prepareRows(
  rows: readonly MixedEducationRowOptions[],
  data: Profile,
  branchLocalControls = false,
  withoutSection = false,
) {
  fixture = createMixedEducationLayerFixture({
    rows,
    branchLocalControls,
    withoutSection,
  });
  const initial = preparationView(document);
  const action = initial.collected.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.displayName === "내용추가");
  expect(action).toBeDefined();
  const plan: AddPlan = {
    actionCandidateId: action!.candidateId,
    command: "ADD_REPEATABLE_GROUP",
    expectedEffect: "GROUP_COUNT_INCREMENT",
  };
  const count = localItemCount(plan, initial.collected, data);
  const added =
    count !== undefined && count > rows.length
      ? await executeApprovedPreparationPlans({
          approvedPlans: [{ plan, approved: true, localItemCount: count }],
          initialSnapshot: initial.execution,
          refreshSnapshot: async () => preparationView(document).execution,
          countRepeatableGroups: (snapshot, current) =>
            snapshot.countRepeatableGroups?.(current) ?? Number.NaN,
        })
      : undefined;
  const kinds = await prepareMixedSectionRows({
    document,
    profile: data,
    signal: new AbortController().signal,
    recordOperation: () => {},
  });
  return { count, added, kinds };
}

function review(
  targets: readonly HTMLElement[],
  data: Profile,
  profileFieldKey: string,
) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const idOf = (target: HTMLElement) =>
    fields.find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return "handle" in lookup && lookup.handle.elements[0] === target;
    })?.candidateId;
  const ids = targets.map(idOf);
  const response: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: fields.map(({ candidateId }) =>
      ids.includes(candidateId)
        ? {
            candidateId,
            matchType: "MATCH" as const,
            valueBinding: { type: "DIRECT" as const, profileFieldKey },
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            autofillPolicy: "CONDITIONAL" as const,
            writePlan: { command: "SEARCH_SELECTION" as const },
          }
        : {
            candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
          },
    ),
  };
  const { items } = buildReviewPlan({
    analysis: validateFieldsResponse(snapshot.request, response),
    registry: snapshot.registry,
    profile: data,
  });
  return ids.map((id) =>
    id ? items.find((item) => item.candidateId === id) : undefined,
  );
}

const kindText = (index: number) =>
  fixture!.row(index).kindSelect.selectedOptions[0]?.textContent;

describe("mixed education rows integration (C6, C7, C8)", () => {
  it("adds one row, prepares both kinds locally and links row 2 to the university entry", async () => {
    const data = highAndUniversity();
    const { count, added, kinds } = await prepareRows(
      [{ highSchoolName: "<보존값>" }],
      data,
    );
    expect(count).toBe(2);
    expect(added).toMatchObject({ status: "completed" });
    expect(fixture!.rows()).toHaveLength(2);
    expect(kinds).toEqual(["selected", "selected"]);
    expect([kindText(0), kindText(1)]).toEqual(["고등학교", "대학교"]);

    const [universityName] = review(
      [fixture!.row(1).branch("college").schoolName],
      data,
      "education.university.schoolName",
    );
    expect(universityName).toMatchObject({
      disabled: false,
      profileEntryId: "entry-1",
    });
    // Row 1's preserved high-school value is not touched by preparation.
    expect(fixture!.row(0).branch("high").schoolName.value).toBe("<보존값>");
  }, 30_000);

  it("adds and prepares rows whose branches carry their own kind select and add action", async () => {
    const data = highAndUniversity();
    const { count, added, kinds } = await prepareRows(
      [{ highSchoolName: "<보존값>" }],
      data,
      true,
    );
    expect(count).toBe(2);
    expect(added).toMatchObject({ status: "completed" });
    expect(fixture!.rows()).toHaveLength(2);
    expect(kinds).toEqual(["selected", "selected"]);
    expect([kindText(0), kindText(1)]).toEqual(["고등학교", "대학교"]);
    expect(fixture!.row(1).branch("college").element.style.display).not.toBe(
      "none",
    );

    const [universityName] = review(
      [fixture!.row(1).branch("college").schoolName],
      data,
      "education.university.schoolName",
    );
    expect(universityName).toMatchObject({
      disabled: false,
      profileEntryId: "entry-1",
    });
    expect(fixture!.row(0).branch("high").schoolName.value).toBe("<보존값>");
  }, 30_000);

  it("adds and prepares branch rows that no section element wraps", async () => {
    const data = highAndUniversity();
    const { count, added, kinds } = await prepareRows([{}], data, true, true);
    expect(count).toBe(2);
    expect(added).toMatchObject({ status: "completed" });
    expect(kinds).toEqual(["selected", "selected"]);
    expect([kindText(0), kindText(1)]).toEqual(["고등학교", "대학교"]);
    const [universityName] = review(
      [fixture!.row(1).branch("college").schoolName],
      data,
      "education.university.schoolName",
    );
    expect(universityName).toMatchObject({
      disabled: false,
      profileEntryId: "entry-1",
    });
  }, 30_000);

  it("keeps a row whose user-selected kind conflicts with the profile unavailable", async () => {
    const data = highAndUniversity();
    const { kinds } = await prepareRows(
      [{ kind: "대학교" }, { kind: "대학교" }],
      data,
    );
    expect(kinds).toEqual(["action-not-ready", "selected"]);
    const [conflicting] = review(
      [fixture!.row(0).branch("college").schoolName],
      data,
      "education.university.schoolName",
    );
    expect(conflicting?.disabled).toBe(true);
  }, 30_000);

  it("keeps a graduate-school row without degreeLevel unavailable", async () => {
    const data = profile(
      ["highSchool", { schoolName: "<고등학교명>" }],
      ["graduateSchool", { schoolName: "<대학원명>" }],
    );
    const { kinds } = await prepareRows([{}, {}], data);
    expect(kinds).toEqual(["selected", "option-label-mismatch"]);
    expect(kindText(1)).toBe("구분");
    // With no kind selected the college branch stays hidden, so the
    // analysis contract cannot target its school name.
    const snapshot = collectFieldsSnapshot(document);
    const target = fixture!.row(1).branch("college").schoolName;
    const candidate = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .find((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return "handle" in lookup && lookup.handle.elements[0] === target;
      });
    expect(candidate?.visibility ?? "hidden").not.toBe("visible");
  }, 30_000);
});
