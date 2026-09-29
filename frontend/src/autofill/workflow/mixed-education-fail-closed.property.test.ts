/**
 * Fail-closed (Property 3, task 4.10): unprovable mixed rows and layers are
 * never written or clicked.
 *
 * Preparation: for generated row kinds and profiles (unmapped kinds, count
 * mismatches, conflicting user selections), a kind select is only ever set to
 * its own assignment's option, and hidden branch values and school codes stay
 * untouched. Search: owned layers whose result set cannot be proven end with
 * an existing failure reason, with no result, confirm or manual click.
 *
 * **Validates: Requirements 2.4, 2.10, 2.12, 2.14, 2.21, 3.12, 3.13, 3.17**
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "../interaction/readonly-search-executor";
import { prepareMixedSectionRows } from "./mixed-section-preparation";
import {
  createMixedEducationLayerFixture,
  type LayerResponseMode,
  type LayerResult,
  type MixedEducationLayerFixture,
} from "./test-utils/mixed-education-layer.fixture";
import { bool, forAllSeeded, int, pick } from "./test-utils/seeded-generators";

const SCHOOL = "<대학교명>";
const KIND_LABELS = ["", "고등학교", "대학교", "대학원(석사)"] as const;

type EntrySpec =
  | "highSchool"
  | "university"
  | "universityUntyped"
  | "graduateMaster"
  | "graduateUntyped";

const ENTRY_OPTION: Record<EntrySpec, string | undefined> = {
  highSchool: "고등학교",
  university: "대학교",
  universityUntyped: undefined,
  graduateMaster: "대학원(석사)",
  graduateUntyped: undefined,
};

function entry(spec: EntrySpec, index: number) {
  const base = {
    id: `entry-${index}`,
    values: { schoolName: `<학교${index}>` },
  };
  switch (spec) {
    case "highSchool":
      return { ...base, sectionId: "highSchool" };
    case "university":
      return {
        ...base,
        sectionId: "university",
        values: { ...base.values, schoolType: "대학교" },
      };
    case "universityUntyped":
      return { ...base, sectionId: "university" };
    case "graduateMaster":
      return {
        ...base,
        sectionId: "graduateSchool",
        values: { ...base.values, degreeLevel: "석사" },
      };
    case "graduateUntyped":
      return { ...base, sectionId: "graduateSchool" };
  }
}

let fixture: MixedEducationLayerFixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  vi.useRealTimers();
});

interface PreparationCase {
  readonly rows: readonly (typeof KIND_LABELS)[number][];
  readonly entries: readonly EntrySpec[];
}

describe("mixed row preparation fail-closed (Property 3)", () => {
  it("only ever selects a row's own provable kind and never touches hidden values", async () => {
    const cases: PreparationCase[] = [];
    forAllSeeded(
      "mixed row preparation",
      { runs: 12 },
      (rng) => {
        const rowCount = int(rng, 2, 3);
        return {
          rows: Array.from({ length: rowCount }, () =>
            bool(rng, 0.6) ? "" : pick(rng, KIND_LABELS),
          ),
          // Sometimes one entry more or less than the rows.
          entries: Array.from(
            { length: rowCount + pick(rng, [0, 0, 0, -1, 1]) },
            () =>
              pick(rng, [
                "highSchool",
                "university",
                "universityUntyped",
                "graduateMaster",
                "graduateUntyped",
              ] as const),
          ),
        };
      },
      (input) => {
        cases.push(input);
      },
    );
    for (const [run, input] of cases.entries()) {
      fixture?.cleanup();
      fixture = createMixedEducationLayerFixture({
        rows: input.rows.map((kind) => ({
          kind,
          highSchoolName: "<보존값>",
          highSchoolCode: "<보존코드>",
        })),
      });
      const data: Profile = {
        ...createEmptyProfile(),
        education: input.entries.map(entry),
      };
      const before = input.rows.map((_, index) => ({
        kind: fixture!.row(index).kindSelect.selectedOptions[0]?.textContent,
        high: fixture!.row(index).branch("high").schoolName.value,
        code: fixture!.row(index).branch("high").schoolCode.value,
        collegeCode: fixture!.row(index).branch("college").schoolCode.value,
      }));
      const results = await prepareMixedSectionRows({
        document,
        profile: data,
        signal: new AbortController().signal,
        recordOperation: () => {},
      });
      const context = `run=${run}, input=${JSON.stringify(input)}, results=${JSON.stringify(results)}`;
      for (const [index, previous] of before.entries()) {
        const row = fixture.row(index);
        const kind = row.kindSelect.selectedOptions[0]?.textContent;
        if (kind !== previous.kind) {
          // A change is only allowed to this row's own mapped profile entry.
          expect(input.entries.length, context).toBe(input.rows.length);
          expect(kind, context).toBe(ENTRY_OPTION[input.entries[index]!]);
          expect(results?.[index], context).toBe("selected");
        }
        if (results?.[index] !== "selected")
          expect(kind, context).toBe(previous.kind);
        expect(row.branch("high").schoolName.value, context).toBe(
          previous.high,
        );
        expect(row.branch("high").schoolCode.value, context).toBe(
          previous.code,
        );
        expect(row.branch("college").schoolCode.value, context).toBe(
          previous.collegeCode,
        );
      }
      if (input.entries.length !== input.rows.length)
        expect(results, context).toBeUndefined();
      expect(
        fixture.events.filter((event) => event.type === "select"),
        context,
      ).toEqual([]);
    }
  }, 60_000);
});

async function searchCollegeRow(
  mode: LayerResponseMode,
  results: readonly LayerResult[],
) {
  vi.useFakeTimers();
  fixture = createMixedEducationLayerFixture({
    rows: [{ kind: "대학교" }],
    results,
    responseMode: mode,
  });
  const branch = fixture.row(0).branch("college");
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

describe("owned layer search fail-closed (Property 3)", () => {
  it.each([
    [
      "zero notice contradiction",
      "zero-notice-contradiction",
      [{ name: SCHOOL, code: "<코드>" }],
    ],
    [
      "zero response without mutation",
      "zero-no-mutation",
      [{ name: SCHOOL, code: "<코드>" }],
    ],
    [
      "no exact match",
      "sync-replace",
      [{ name: "<다른학교>", code: "<코드>" }],
    ],
    [
      "two exact matches",
      "sync-replace",
      [
        { name: SCHOOL, code: "<코드1>" },
        { name: SCHOOL, code: "<코드2>" },
      ],
    ],
  ] as const)(
    "%s ends without any click on results, confirm or manual input",
    async (_name, mode, results) => {
      const { branch, result } = await searchCollegeRow(mode, results);
      expect(result.status).not.toBe("selected");
      expect([
        "result_pending",
        "result_set_incomplete",
        "search_results_not_found",
        "multiple_matching_results",
        "surface_ambiguous",
        "surface_unobservable",
        "result_activation_unsafe",
      ]).toContain("reason" in result ? result.reason : undefined);
      expect(
        fixture!.events.filter(
          (event) => event.type === "select" || event.type === "manual-toggle",
        ),
      ).toEqual([]);
      expect(branch.schoolName.value).toBe("");
      expect(branch.schoolCode.value).toBe("");
      expect(branch.manualInput.value).toBe("");
    },
    30_000,
  );
});
