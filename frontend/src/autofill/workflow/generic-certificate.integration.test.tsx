import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { PreparationPlan } from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { buildReviewPlan } from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
} from "../write/executor";
import {
  renderGenericCertificateFixture,
  type GenericCertificateFixtureKind,
} from "../../../tests/fixtures/generic-certificate/generic-certificate-fixtures";

const variants: readonly GenericCertificateFixtureKind[] = [
  "cj-shaped",
  "renamed-identifiers",
  "fieldset-list",
];

function certificateProfile(): Profile {
  return {
    ...createEmptyProfile(),
    certifications: [0, 1, 2].map((index) => ({
      id: `certificate-${index + 1}`,
      sectionId: "certificate",
      values: {
        name: `synthetic certificate level ${index + 1}`,
        grade: `level ${index + 1}`,
        issuer: `synthetic issuer ${index + 1}`,
        acquisitionDate: `2024-0${index + 1}-0${index + 1}`,
      },
    })),
  };
}

function candidateIdFor(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
  element: HTMLInputElement | HTMLSelectElement,
): string {
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return "handle" in lookup && lookup.handle.elements[0] === element;
    });
  if (!candidate) throw new Error("fixture control was not collected");
  return candidate.candidateId;
}

function analysis(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
  controls: readonly {
    element: HTMLInputElement | HTMLSelectElement;
    field: "name" | "grade" | "issuer" | "acquisitionDate";
    command: "SEARCH_SELECTION" | "SELECT_OPTION" | "SET_TEXT";
  }[],
): FieldsAnalyzeResponse {
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: controls.map(({ element, field, command }) => ({
      candidateId: candidateIdFor(snapshot, element),
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: `certifications.certificate.${field}`,
      },
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      autofillPolicy: "CONDITIONAL",
      writePlan: { command },
    })),
  };
}

function preparationSnapshot(document: Document) {
  const collected = collectPreparationSnapshot(document);
  return {
    collected,
    execution: {
      registry: collected.registry,
      isTargetSectionVisible: () => true,
      countRepeatableGroups: (
        plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
      ) => collected.countRepeatableGroups(plan.actionCandidateId),
      repeatableGroupState: (
        plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
      ) => collected.repeatableGroupState(plan.actionCandidateId),
    },
  };
}

async function prepareThreeRows(document: Document) {
  const initial = preparationSnapshot(document);
  const action = initial.collected.request.sections
    .flatMap((section) => section.actionCandidates)
    .find((candidate) => candidate.displayName === "자격증 추가");
  if (!action) throw new Error("fixture add action was not collected");
  return executeApprovedPreparationPlans({
    approvedPlans: [
      {
        plan: {
          actionCandidateId: action.candidateId,
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
        },
        approved: true,
        localItemCount: 3,
      },
    ],
    initialSnapshot: initial.execution,
    refreshSnapshot: async () => preparationSnapshot(document).execution,
    countRepeatableGroups: (snapshot, plan) =>
      snapshot.countRepeatableGroups?.(plan) ?? Number.NaN,
  });
}

function rowControls(row: HTMLElement) {
  return {
    name: row.querySelector<HTMLInputElement>("[data-certificate-name]")!,
    grade: row.querySelector<HTMLSelectElement>("[data-certificate-grade]")!,
    issuer: row.querySelector<HTMLInputElement>("[data-certificate-issuer]")!,
    date: row.querySelector<HTMLInputElement>("[data-certificate-date]")!,
    registration: row.querySelector<HTMLInputElement>(
      "[data-certificate-registration]",
    )!,
  };
}

describe("generic certificate workflow integration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it.each(variants)(
    "prepares one %s row to three with the same generic action and preserves existing values",
    async (kind) => {
      const fixture = renderGenericCertificateFixture(document, kind);

      await expect(prepareThreeRows(document)).resolves.toMatchObject({
        status: "completed",
        executedPlanCount: 2,
      });

      expect(fixture.clicks()).toBe(2);
      expect(fixture.rows()).toHaveLength(3);
      expect(
        fixture.rows().map((row) => rowControls(row).registration.value),
      ).toEqual(["preserved-1", "preserved-2", "preserved-3"]);
    },
  );

  it("requires a fresh explicit review before grade, issuer, or YYYY.MM.DD date writes", async () => {
    const fixture = renderGenericCertificateFixture(document, "cj-shaped");
    const profile = certificateProfile();
    await prepareThreeRows(document);

    const initialSnapshot = collectFieldsSnapshot(document);
    const initialPlan = buildReviewPlan({
      analysis: analysis(
        initialSnapshot,
        fixture.rows().map((row) => ({
          element: rowControls(row).name,
          field: "name" as const,
          command: "SEARCH_SELECTION" as const,
        })),
      ),
      profile,
      registry: initialSnapshot.registry,
    });
    const approvedNames = initialPlan.items.map((item) => ({
      ...item,
      selected: true,
    }));
    const observedFollowUps: HTMLElement[][] = [];

    const pending = executeApprovedWritesAfterPageSettles({
      items: approvedNames,
      approvedCandidateIds: new Set(
        approvedNames.map((item) => item.candidateId),
      ),
      registry: initialSnapshot.registry,
      onSearchFollowUp: (_item, controls) => {
        observedFollowUps.push([...controls]);
      },
    });
    await vi.runAllTimersAsync();
    const initialResults = await pending;
    expect(initialResults).toMatchObject([
      { status: "written" },
      { status: "skipped", outcome: "needs-verification" },
      { status: "skipped", outcome: "needs-verification" },
    ]);

    expect(fixture.searchActions()).toEqual({
      opens: 1,
      submits: 1,
      results: 1,
    });
    expect(observedFollowUps).toHaveLength(1);
    expect(fixture.rows().map((row) => rowControls(row).name.value)).toEqual([
      profile.certifications[0]!.values.name,
      "",
      "",
    ]);
    expect(fixture.rows().map((row) => rowControls(row).issuer.value)).toEqual([
      "",
      "",
      "",
    ]);
    expect(fixture.rows().map((row) => rowControls(row).date.value)).toEqual([
      "",
      "",
      "",
    ]);

    const refreshedSnapshot = collectFieldsSnapshot(document);
    const refreshedPlan = buildReviewPlan({
      analysis: analysis(
        refreshedSnapshot,
        (() => {
          const controls = rowControls(fixture.rows()[0]!);
          return [
            {
              element: controls.grade,
              field: "grade" as const,
              command: "SELECT_OPTION" as const,
            },
            {
              element: controls.issuer,
              field: "issuer" as const,
              command: "SET_TEXT" as const,
            },
            {
              element: controls.date,
              field: "acquisitionDate" as const,
              command: "SET_TEXT" as const,
            },
          ];
        })(),
      ),
      profile,
      registry: refreshedSnapshot.registry,
    });
    expect(refreshedPlan.items.every((item) => !item.selected)).toBe(true);

    const secondApproval = refreshedPlan.items.map((item) => ({
      ...item,
      selected: true,
    }));
    const writeResults = executeApprovedWrites({
      items: secondApproval,
      approvedCandidateIds: new Set(
        secondApproval.map((item) => item.candidateId),
      ),
      registry: refreshedSnapshot.registry,
    });

    expect(writeResults.every((result) => result.status === "written")).toBe(
      true,
    );
    expect(fixture.rows().map((row) => rowControls(row).grade.value)).toEqual([
      "level 1",
      "",
      "",
    ]);
    expect(fixture.rows().map((row) => rowControls(row).issuer.value)).toEqual([
      profile.certifications[0]!.values.issuer,
      "",
      "",
    ]);
    expect(fixture.rows().map((row) => rowControls(row).date.value)).toEqual([
      "2024.01.01",
      "",
      "",
    ]);
  });

  it.each(variants)(
    "runs every %s profile row through search, fresh review, and exact dependent writes",
    async (kind) => {
      const fixture = renderGenericCertificateFixture(document, kind);
      const profile = certificateProfile();
      await prepareThreeRows(document);
      const followUps: HTMLElement[][] = [];

      for (const [index, entry] of profile.certifications.entries()) {
        const row = fixture.rows()[index]!;
        const beforeSearch = collectFieldsSnapshot(document);
        const searchPlan = buildReviewPlan({
          analysis: analysis(beforeSearch, [
            {
              element: rowControls(row).name,
              field: "name",
              command: "SEARCH_SELECTION",
            },
          ]),
          profile,
          registry: beforeSearch.registry,
        });
        const approvedSearch = searchPlan.items.map((item) => ({
          ...item,
          selected: true,
        }));
        const pendingSearch = executeApprovedWritesAfterPageSettles({
          items: approvedSearch,
          approvedCandidateIds: new Set(
            approvedSearch.map((item) => item.candidateId),
          ),
          registry: beforeSearch.registry,
          onSearchFollowUp: (_item, controls) => {
            followUps.push([...controls]);
          },
        });

        await vi.runAllTimersAsync();
        await expect(pendingSearch).resolves.toMatchObject([
          { status: "written" },
        ]);
        expect(followUps).toHaveLength(index + 1);
        expect(rowControls(row).name.value).toBe(entry.values.name);

        const refreshed = collectFieldsSnapshot(document);
        const freshPlan = buildReviewPlan({
          analysis: analysis(refreshed, [
            {
              element: rowControls(row).grade,
              field: "grade",
              command: "SELECT_OPTION",
            },
            {
              element: rowControls(row).issuer,
              field: "issuer",
              command: "SET_TEXT",
            },
            {
              element: rowControls(row).date,
              field: "acquisitionDate",
              command: "SET_TEXT",
            },
          ]),
          profile,
          registry: refreshed.registry,
        });
        expect(freshPlan.items.every((item) => !item.selected)).toBe(true);
        const approvedDependent = freshPlan.items.map((item) => ({
          ...item,
          selected: true,
        }));

        expect(
          executeApprovedWrites({
            items: approvedDependent,
            approvedCandidateIds: new Set(
              approvedDependent.map((item) => item.candidateId),
            ),
            registry: refreshed.registry,
          }).every((result) => result.status === "written"),
        ).toBe(true);
        expect(rowControls(row).grade.value).toBe(entry.values.grade);
        expect(rowControls(row).issuer.value).toBe(entry.values.issuer);
        expect(rowControls(row).date.value).toBe(
          entry.values.acquisitionDate?.replaceAll("-", "."),
        );
      }

      expect(fixture.rows()).toHaveLength(3);
      expect(fixture.rows().map((row) => rowControls(row).name.value)).toEqual(
        profile.certifications.map((entry) => entry.values.name),
      );
    },
    20_000,
  );

  it("does not select incomplete results or a result without a bound relation value", async () => {
    const incomplete = renderGenericCertificateFixture(document, "cj-shaped", {
      completeQueryEvidence: false,
    });
    const profile = certificateProfile();
    const incompleteSnapshot = collectFieldsSnapshot(document);
    const incompletePlan = buildReviewPlan({
      analysis: analysis(incompleteSnapshot, [
        {
          element: rowControls(incomplete.rows()[0]!).name,
          field: "name",
          command: "SEARCH_SELECTION",
        },
      ]),
      profile: { ...profile, certifications: [profile.certifications[0]!] },
      registry: incompleteSnapshot.registry,
    });
    const pending = executeApprovedWritesAfterPageSettles({
      items: incompletePlan.items.map((item) => ({ ...item, selected: true })),
      approvedCandidateIds: new Set([incompletePlan.items[0]!.candidateId]),
      registry: incompleteSnapshot.registry,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject([
      { status: "skipped", outcome: "needs-verification" },
    ]);
    expect(incomplete.searchActions().results).toBe(0);
    expect(rowControls(incomplete.rows()[0]!).name.value).toBe("");

    document.body.replaceChildren();
    const unbound = renderGenericCertificateFixture(
      document,
      "renamed-identifiers",
    );
    unbound.rows()[0]!.querySelector("[data-certificate-code]")!.remove();
    const unboundSnapshot = collectFieldsSnapshot(document);
    const unboundPlan = buildReviewPlan({
      analysis: analysis(unboundSnapshot, [
        {
          element: rowControls(unbound.rows()[0]!).name,
          field: "name",
          command: "SEARCH_SELECTION",
        },
      ]),
      profile: { ...profile, certifications: [profile.certifications[0]!] },
      registry: unboundSnapshot.registry,
    });
    const unboundPending = executeApprovedWritesAfterPageSettles({
      items: unboundPlan.items.map((item) => ({ ...item, selected: true })),
      approvedCandidateIds: new Set([unboundPlan.items[0]!.candidateId]),
      registry: unboundSnapshot.registry,
    });
    await vi.runAllTimersAsync();
    await expect(unboundPending).resolves.toMatchObject([
      { status: "skipped", outcome: "needs-verification" },
    ]);
    expect(unbound.searchActions().results).toBe(0);
    expect(rowControls(unbound.rows()[0]!).name.value).toBe("");
  });
});
