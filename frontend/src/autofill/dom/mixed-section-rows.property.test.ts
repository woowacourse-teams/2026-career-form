/**
 * Bug condition exploration (Property 1, task 2): identifier-less repeat rows
 * and mixed-section education rows.
 *
 * These tests encode the expected behavior and are expected to FAIL on the
 * unfixed code: the rows carry no `*-item` name, repeat marker or
 * fieldset+legend, and the add button sits inside the first row, so no
 * generic row path detects them (T1-2). The mixed-row assertions use only
 * existing public paths (`localItemCount`, `buildReviewPlan`), so they compile
 * before `mixedSectionGroup`/`assignMixedRows` exist.
 *
 * The preservation sections (Property 2, task 3) pin the row detection of
 * existing structures and structures where the identifier-less row rule must
 * not apply, and `localItemCount` outside mixed groups; they pass on the
 * unfixed code.
 *
 * **Validates: Requirements 1.13, 2.3, 2.5, 2.21, 3.3, 3.4, 3.23**
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldCandidate, FieldsAnalyzeResponse } from "../api/types";
import { validateFieldsResponse } from "../api/validate-response";
import { buildReviewPlan } from "../review/review-plan";
import { localItemCount } from "../workflow/workflow-model";
import {
  referenceGenericRowFor,
  referenceGenericRows,
  referenceLocalItemCount,
} from "../workflow/test-utils/preservation-reference";
import {
  createMixedEducationLayerFixture,
  type EducationKindLabel,
  type MixedEducationLayerFixture,
  type MixedEducationRowOptions,
} from "../workflow/test-utils/mixed-education-layer.fixture";
import {
  bool,
  forAllSeeded,
  int,
  pick,
} from "../workflow/test-utils/seeded-generators";
import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";
import { genericFormGroups } from "./generic-form-groups";
import { assignRepeatGroups } from "./repeat-groups";
import { genericRowFor, genericRows } from "./repeatable-rows";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function mixedProfile(): Profile {
  return {
    ...createEmptyProfile(),
    education: [
      {
        id: "entry-high",
        sectionId: "highSchool",
        values: { schoolName: "<고등학교명>" },
      },
      {
        id: "entry-univ",
        sectionId: "university",
        values: { schoolType: "대학교", schoolName: "<대학교명>" },
      },
    ],
  };
}

/** highSchool 1 + university 2, in the order highSchool, univ-A, univ-B. */
function threeEntryProfile(): Profile {
  return {
    ...createEmptyProfile(),
    education: [
      {
        id: "entry-high",
        sectionId: "highSchool",
        values: { schoolName: "<고등학교명>" },
      },
      {
        id: "entry-univ-a",
        sectionId: "university",
        values: { schoolType: "대학교", schoolName: "<대학교명A>" },
      },
      {
        id: "entry-univ-b",
        sectionId: "university",
        values: { schoolType: "대학교", schoolName: "<대학교명B>" },
      },
    ],
  };
}

function addActionCandidateId(): {
  snapshot: ReturnType<typeof collectPreparationSnapshot>;
  actionCandidateId: string | undefined;
} {
  const snapshot = collectPreparationSnapshot(document);
  const action = snapshot.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.displayName === "내용추가");
  return { snapshot, actionCandidateId: action?.candidateId };
}

function visibleSchoolName(
  fixture: MixedEducationLayerFixture,
  index: number,
): HTMLInputElement {
  const row = fixture.row(index);
  const kind = row.kindSelect.selectedOptions[0]?.textContent ?? "";
  return row.branch(kind === "" || kind === "고등학교" ? "high" : "college")
    .schoolName;
}

type FieldsSnapshot = ReturnType<typeof collectFieldsSnapshot>;
type ReviewItem = ReturnType<typeof buildReviewPlan>["items"][number];

/** Where a candidate sits in the fields request: flat fields or a row item. */
interface CandidatePlacement {
  readonly candidate: FieldCandidate;
  readonly placement: "section.fields" | "section.items";
  readonly itemId?: string;
}

function allPlacements(snapshot: FieldsSnapshot): CandidatePlacement[] {
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields.map((candidate): CandidatePlacement => ({
      candidate,
      placement: "section.fields",
    })),
    ...(section.items ?? []).flatMap((item) =>
      item.fields.map((candidate): CandidatePlacement => ({
        candidate,
        placement: "section.items",
        itemId: item.itemId,
      })),
    ),
  ]);
}

function placementOf(
  snapshot: FieldsSnapshot,
  target: HTMLElement,
): CandidatePlacement | undefined {
  return allPlacements(snapshot).find(({ candidate }) => {
    const lookup = snapshot.registry.lookupField(candidate.candidateId);
    return (
      (lookup.status === "blocked" || lookup.status === "ready") &&
      lookup.handle.elements[0] === target
    );
  });
}

/**
 * Maps every target to `education.university.schoolName` (all other
 * candidates NO_MATCH) and returns the review item of each target in order.
 */
function reviewItemsFor(
  targets: readonly HTMLElement[],
  profile: Profile,
): Array<ReviewItem | undefined> {
  const snapshot = collectFieldsSnapshot(document);
  const targetIds = targets.map(
    (target) => placementOf(snapshot, target)?.candidate.candidateId,
  );
  expect(targetIds.every((id) => id !== undefined)).toBe(true);
  const matched = new Set(targetIds);
  const response: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: allPlacements(snapshot).map(({ candidate }) =>
      matched.has(candidate.candidateId)
        ? {
            candidateId: candidate.candidateId,
            matchType: "MATCH" as const,
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey: "education.university.schoolName",
            },
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            autofillPolicy: "CONDITIONAL" as const,
            writePlan: { command: "SEARCH_SELECTION" as const },
          }
        : {
            candidateId: candidate.candidateId,
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
    profile,
  });
  return targetIds.map((id) =>
    items.find((candidate) => candidate.candidateId === id),
  );
}

let fixture: MixedEducationLayerFixture | undefined;

beforeEach(() => {
  setPageUrl("https://careers.example.test/apply");
  document.body.replaceChildren();
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  document.body.replaceChildren();
});

describe("identifier-less repeat rows (bug condition, 1.13)", () => {
  it("detects the single initial row and both rows after 내용추가", () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }],
    });
    expect(genericRows(fixture.container)).toEqual(fixture.rows());

    fixture.addRowButton.click();
    expect(fixture.rows()).toHaveLength(2);
    expect(genericRows(fixture.container)).toEqual(fixture.rows());
    expect(genericRowFor(fixture.row(1).branch("college").schoolName)).toBe(
      fixture.row(1).element,
    );
  });

  it("counts rows through the add action of the preparation snapshot", () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }],
    });
    const initial = addActionCandidateId();
    expect(initial.actionCandidateId).toBeDefined();
    expect(
      initial.snapshot.countRepeatableGroups(initial.actionCandidateId!),
    ).toBe(1);

    fixture.addRowButton.click();
    const afterAdd = addActionCandidateId();
    expect(afterAdd.actionCandidateId).toBeDefined();
    expect(
      afterAdd.snapshot.countRepeatableGroups(afterAdd.actionCandidateId!),
    ).toBe(2);
  });

  it("property: every generated row is one repeat row of the container", () => {
    const kinds: readonly (EducationKindLabel | "")[] = [
      "",
      "고등학교",
      "전문대학",
      "대학교",
    ];
    forAllSeeded(
      "identifier-less repeat rows",
      { runs: 25 },
      (rng) => ({
        rows: Array.from(
          { length: int(rng, 1, 3) },
          (): MixedEducationRowOptions => ({ kind: pick(rng, kinds) }),
        ),
        anomalies: {
          duplicateBranchIds: bool(rng),
          nanIdsInNewRows: bool(rng),
          labelForMismatchInNewRows: bool(rng),
        },
      }),
      (input) => {
        fixture?.cleanup();
        fixture = createMixedEducationLayerFixture(input);
        const rows = fixture.rows();
        expect(genericRows(fixture.container)).toEqual(rows);
        rows.forEach((row, index) =>
          expect(genericRowFor(visibleSchoolName(fixture!, index))).toBe(row),
        );
      },
    );
  }, 30_000);
});

describe("mixed-section education rows (bug condition, 2.3, 2.5)", () => {
  it("needs one row per covered education entry (highSchool 1 + university 1 = 2)", () => {
    fixture = createMixedEducationLayerFixture({ rows: [{}] });
    const { snapshot, actionCandidateId } = addActionCandidateId();
    expect(actionCandidateId).toBeDefined();
    expect(
      localItemCount(
        {
          actionCandidateId: actionCandidateId!,
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
        snapshot,
        mixedProfile(),
      ),
    ).toBe(2);
  });

  // Post-fix regression check. It already passes on the unfixed code because
  // a single university entry decides the direct binding on its own.
  it("links the second row's visible school name to the university entry", () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }, { kind: "대학교" }],
    });
    const [item] = reviewItemsFor(
      [fixture.row(1).branch("college").schoolName],
      mixedProfile(),
    );
    // Row-structured link: the second row is the first university entry.
    expect(item).toMatchObject({
      disabled: false,
      profileEntryId: "entry-univ",
      itemIndex: 0,
    });
  });

  it("collects the second row's school name as a row item with row context", () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }, { kind: "대학교" }],
    });
    const target = fixture.row(1).branch("college").schoolName;
    const snapshot = collectFieldsSnapshot(document);
    const placement = placementOf(snapshot, target);
    expect(placement).toBeDefined();
    const lookup = snapshot.registry.lookupField(
      placement!.candidate.candidateId,
    );
    const handle =
      lookup.status === "ready" || lookup.status === "blocked"
        ? lookup.handle
        : undefined;
    expect({
      placement: placement!.placement,
      hasItemId: placement!.itemId !== undefined,
      handleItemIndex: handle?.itemIndex,
      repeat: placement!.candidate.semanticContext?.repeat,
    }).toMatchObject({
      placement: "section.items",
      hasItemId: true,
      handleItemIndex: 1,
      repeat: { rowIndex: 1, rowCount: 2 },
    });
  });

  it("links the third row to the second university entry (high 1 + univ 2, 3 rows)", () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }, { kind: "대학교" }, { kind: "대학교" }],
    });
    const [second, third] = reviewItemsFor(
      [
        fixture.row(1).branch("college").schoolName,
        fixture.row(2).branch("college").schoolName,
      ],
      threeEntryProfile(),
    );
    expect({
      second: {
        disabled: second?.disabled,
        profileEntryId: second?.profileEntryId,
      },
      third: {
        disabled: third?.disabled,
        profileEntryId: third?.profileEntryId,
      },
    }).toEqual({
      second: { disabled: false, profileEntryId: "entry-univ-a" },
      third: { disabled: false, profileEntryId: "entry-univ-b" },
    });
  }, 30_000);
});

type ExistingStructure =
  "item-name" | "repeat-marker" | "fieldset" | "multirow";
type NonRepeatStructure =
  | "signature-mismatch"
  | "no-add-action"
  | "two-add-actions"
  | "reset-only"
  | "nested-ambiguous";

const rowControls = (index: number) =>
  `<label>학교명<input name="school${index}" type="text"></label>` +
  `<label>전공<input name="major${index}" type="text"></label>`;

function existingRow(
  structure: ExistingStructure,
  index: number,
  innerAdd: boolean,
): string {
  const inner =
    innerAdd && index === 0 ? '<button type="button">내용추가</button>' : "";
  switch (structure) {
    case "item-name":
      return `<div class="edu-item">${rowControls(index)}${inner}</div>`;
    case "repeat-marker":
      return `<div data-repeater-item>${rowControls(index)}${inner}</div>`;
    case "fieldset":
      return `<fieldset><legend>학교</legend>${rowControls(index)}${inner}</fieldset>`;
    case "multirow":
      return `<div ismultirow="true">${rowControls(index)}${inner}</div>`;
  }
}

function nonRepeatRow(structure: NonRepeatStructure, index: number): string {
  const first = index === 0;
  switch (structure) {
    case "signature-mismatch":
      return index === 1
        ? `<div><select name="kind${index}"><option>A</option></select><input name="other${index}" type="text"></div>`
        : `<div>${rowControls(index)}${first ? '<button type="button">내용추가</button>' : ""}</div>`;
    case "no-add-action":
      return `<div>${rowControls(index)}</div>`;
    case "two-add-actions":
      return `<div>${rowControls(index)}${first ? '<button type="button">내용추가</button><button type="button">추가</button>' : ""}</div>`;
    case "reset-only":
      return `<div>${rowControls(index)}${first ? '<button type="button">초기화</button>' : ""}</div>`;
    case "nested-ambiguous":
      return `<div><div>${rowControls(index)}</div><div>${rowControls(index + 10)}</div>${first ? '<button type="button">내용추가</button>' : ""}</div>`;
  }
}

interface RowCase {
  readonly rows: number;
  readonly innerAdd: boolean;
}

function renderRows(rows: readonly string[], outerAdd: boolean): Element {
  document.body.innerHTML =
    `<section><h3>학력사항</h3><div id="rows">${rows.join("")}</div>` +
    `${outerAdd ? '<button type="button">학력 추가</button>' : ""}</section>`;
  return document.getElementById("rows")!;
}

interface RowObservation {
  readonly rows: number;
  readonly firstRowFound: boolean;
  readonly groups: number;
  readonly counts: readonly (number | undefined)[];
  readonly items: number;
  readonly flatFields: number;
}

function observeRows(container: Element): RowObservation {
  const rows = genericRows(container);
  expect(rows).toEqual(referenceGenericRows(container));
  for (const control of container.querySelectorAll("input, select"))
    expect(genericRowFor(control)).toBe(referenceGenericRowFor(control));
  if (rows.length) {
    const live = assignRepeatGroups(
      container,
      rows,
      () => undefined,
      "education",
    );
    const reference = assignRepeatGroups(
      container,
      referenceGenericRows(container),
      () => undefined,
      "education",
    );
    expect(
      live.map((row) => [row.row, row.groupOrdinal, row.ambiguous]),
    ).toEqual(
      reference.map((row) => [row.row, row.groupOrdinal, row.ambiguous]),
    );
  }
  const preparation = collectPreparationSnapshot(document);
  const counts = preparation.request.sections
    .flatMap((section) => section.actionCandidates)
    .map((action) => preparation.countRepeatableGroups(action.candidateId));
  const fields = collectFieldsSnapshot(document);
  return {
    rows: rows.length,
    firstRowFound:
      genericRowFor(container.querySelector("input")!) !== undefined,
    groups: genericFormGroups(document).length,
    counts,
    items: fields.request.sections.flatMap((section) => section.items ?? [])
      .length,
    flatFields: fields.request.sections.flatMap((section) => section.fields)
      .length,
  };
}

const rowCase = (rng: () => number): RowCase => ({
  rows: int(rng, 1, 3),
  innerAdd: bool(rng),
});

describe("existing repeat row detection preservation (Property 2, 3.23)", () => {
  it("keeps *-item, repeat marker, fieldset+legend and multirow detection", () => {
    forAllSeeded(
      "existing row structures",
      { runs: 24 },
      (rng) => ({
        structure: pick(rng, [
          "item-name",
          "repeat-marker",
          "fieldset",
          "multirow",
        ] as const),
        ...rowCase(rng),
      }),
      ({ structure, rows, innerAdd }) => {
        const container = renderRows(
          Array.from({ length: rows }, (_, index) =>
            existingRow(structure, index, innerAdd),
          ),
          true,
        );
        const observed = observeRows(container);
        // Observed on the unfixed code: a single fieldset is not a row.
        const detected = structure !== "fieldset" || rows >= 2;
        expect(observed.firstRowFound).toBe(detected);
        expect(observed.rows).toBe(
          structure === "multirow" || !detected ? 0 : rows,
        );
        expect(observed.groups).toBe(structure === "multirow" ? 1 : 0);
        expect(observed.counts).toEqual(
          Array(innerAdd ? 2 : 1).fill(detected ? rows : 0),
        );
        expect(observed.items).toBe(detected ? rows : 0);
        expect(observed.flatFields).toBe(detected ? 0 : rows * 2);
      },
    );
  }, 30_000);

  it("detects no rows where the identifier-less row rule must not apply", () => {
    forAllSeeded(
      "non-repeat row structures",
      { runs: 30 },
      (rng) => ({
        structure: pick(rng, [
          "signature-mismatch",
          "no-add-action",
          "two-add-actions",
          "reset-only",
          "nested-ambiguous",
        ] as const),
        ...rowCase(rng),
      }),
      ({ structure, rows }) => {
        const count =
          structure === "signature-mismatch" ? Math.max(rows, 2) : rows;
        const container = renderRows(
          Array.from({ length: count }, (_, index) =>
            nonRepeatRow(structure, index),
          ),
          false,
        );
        const observed = observeRows(container);
        const controls = container.querySelectorAll("input, select").length;
        expect(observed.rows).toBe(0);
        expect(observed.firstRowFound).toBe(false);
        expect(observed.groups).toBe(0);
        expect(observed.counts.every((value) => value === 0)).toBe(true);
        expect(observed.items).toBe(0);
        expect(observed.flatFields).toBe(controls);
      },
    );
  }, 30_000);
});

type ItemCountLayout =
  "no-kind-select" | "single-section" | "separate-sections";

function itemCountLayout(layout: ItemCountLayout, rows: number): void {
  const row = (index: number) =>
    layout === "single-section"
      ? `<div class="edu-item"><select name="kind${index}"><option value="">구분</option><option>대학교</option><option>전문대학</option></select>${rowControls(index)}</div>`
      : `<div class="edu-item">${rowControls(index)}</div>`;
  const area = (title: string, offset: number) =>
    `<section><h3>${title}</h3><div>${Array.from({ length: rows }, (_, index) => row(index + offset)).join("")}</div><button type="button">${title} 추가</button></section>`;
  document.body.innerHTML =
    layout === "separate-sections"
      ? area("고등학교", 0) + area("대학교", 10)
      : area("학력사항", 0);
}

describe("localItemCount preservation (Property 2, 3.3, 3.4)", () => {
  it("matches the pre-fix count outside mixed-section groups", () => {
    forAllSeeded(
      "non-mixed localItemCount",
      { runs: 30 },
      (rng) => ({
        layout: pick(rng, [
          "no-kind-select",
          "single-section",
          "separate-sections",
        ] as const),
        rows: int(rng, 1, 3),
        highSchool: int(rng, 0, 2),
        university: int(rng, 0, 2),
      }),
      ({ layout, rows, highSchool, university }) => {
        itemCountLayout(layout, rows);
        const profile: Profile = {
          ...createEmptyProfile(),
          education: [
            ...Array.from({ length: highSchool }, (_, index) => ({
              id: `high-${index}`,
              sectionId: "highSchool",
              values: { schoolName: `<고등학교명${index}>` },
            })),
            ...Array.from({ length: university }, (_, index) => ({
              id: `univ-${index}`,
              sectionId: "university",
              values: {
                schoolType: "대학교",
                schoolName: `<대학교명${index}>`,
              },
            })),
          ],
        };
        const snapshot = collectPreparationSnapshot(document);
        for (const action of snapshot.request.sections.flatMap(
          (section) => section.actionCandidates,
        )) {
          const plan = {
            actionCandidateId: action.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          } as const;
          expect(localItemCount(plan, snapshot, profile)).toBe(
            referenceLocalItemCount(plan, snapshot, profile),
          );
        }
      },
    );
  }, 30_000);
});
