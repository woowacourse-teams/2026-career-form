import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { approvedReviewExecution } from "../workflow/workflow-write-items";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import {
  analyzeGenericFields,
  applyGenericGrade,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "./generic-analysis";
import {
  applyGenericStructureAnalysis,
  applyGenericStructureReview,
  bindGenericStructureRows,
} from "./structure-context";
import { runGenericStructureLoop } from "./structure-loop";

const HIGH_SCHOOL_KEY = "education.highSchool.schoolName";
const UNIVERSITY_KEY = "education.university.major";
const GRADUATE_KEY = "education.graduateSchool.major";
const SYNTHETIC_SCHOOL = "Synthetic High School";
const stageSelect = `<select name="stage"><option value="">선택</option>
  <option value="H" selected>고등학교</option><option value="U">대학교</option></select>`;
const fixtures = [
  {
    name: "NAVER sanitized",
    html: () =>
      readFileSync(
        join(
          process.cwd(),
          "fixtures/dom-snapshots/naver-education-stage/sanitized.html",
        ),
        "utf8",
      ),
    school: ".type01 input",
    hidden: ".type02 input",
    otherKey: UNIVERSITY_KEY,
  },
  {
    name: "table row",
    html: () => `<section><h3>학력</h3><table><tbody>
      <tr data-repeatable-group><td>${stageSelect}</td>
      <td><label>고등학교 학교명<input name="school"></label></td>
      <td><label>확인<input name="unapproved"></label></td>
      <td style="display:none"><input name="major"><input name="minor"></td>
      </tr></tbody></table></section>`,
    school: "[name=school]",
    hidden: "[name=major]",
    otherKey: UNIVERSITY_KEY,
  },
  {
    name: "card row",
    html: () => `<section><h3>학력</h3><div class="row" data-repeatable-group>
      ${stageSelect}<label>고등학교 학교명<input name="school"></label>
      <label>확인<input name="unapproved"></label>
      <div hidden><div aria-hidden="true" style="display:none">
      <input name="major"><input name="minor"></div></div></div></section>`,
    school: "[name=school]",
    hidden: "[name=major]",
    otherKey: GRADUATE_KEY,
  },
];
type Scenario =
  | "hidden-only"
  | "writable"
  | "disabled"
  | "readonly"
  | "manual"
  | "zero-visible";
type ResponseField = GenericFieldsResponse["fields"][number];

afterEach(() => document.body.replaceChildren());

async function analyze(fixture: (typeof fixtures)[number], scenario: Scenario) {
  document.body.innerHTML = fixture.html();
  const school = document.querySelector<HTMLInputElement>(fixture.school)!;
  const hidden = document.querySelector<HTMLInputElement>(fixture.hidden)!;
  // The real snapshot's school uses a readonly site search. Offline write
  // integration deliberately supplies an ordinary writable synthetic target.
  school.readOnly = false;
  const initial = collectFieldsSnapshot(document, new Map(), {
    mixedSectionDetection: false,
  });
  const candidates = initial.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const idsByElement = new Map<Element, string>();
  for (const field of candidates) {
    const lookup = initial.registry.lookupField(field.candidateId);
    if ("handle" in lookup)
      for (const element of lookup.handle.elements)
        idsByElement.set(element, field.candidateId);
  }
  const idOf = (element: Element) => idsByElement.get(element)!;
  const schoolId = idOf(school);
  const hiddenId = idOf(hidden);
  const controls = Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input,select,textarea"),
  );
  const unapproved = controls.find(
    (control): control is HTMLInputElement =>
      control instanceof HTMLInputElement &&
      control !== school &&
      candidates.some(
        (field) =>
          field.visibility === "visible" && idOf(control) === field.candidateId,
      ),
  )!;
  const conflictId = idOf(unapproved);
  const conflict = !["hidden-only", "zero-visible"].includes(scenario);
  unapproved.readOnly = scenario === "readonly";
  if (scenario === "disabled") unapproved.disabled = true;
  hidden.value = "synthetic-hidden-keep";
  unapproved.value = "synthetic-unapproved-keep";
  // Capture every candidate's DOM value, including selects and hidden inputs.
  const before = controls.map((control) => control.value);
  const requests: string[][] = [];
  const client: AnalysisApiClient = {
    analyzePreparation: async () => {
      throw new Error("unexpected preparation");
    },
    analyzeFields: async () => {
      throw new Error("unexpected legacy analysis");
    },
    decideInteractions: async (request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        role: decision.role,
        selection:
          decision.targetKind === "HIGH_SCHOOL" ? "SELECTED" : "ABSTAINED",
        // The sanitized fixture already selects option ordinal 1. Synthetic
        // fixtures omit their empty prompt from the offered candidate list.
        candidateId:
          decision.targetKind === "HIGH_SCHOOL"
            ? decision.candidates[fixture.name === "NAVER sanitized" ? 1 : 0]!
                .candidateId
            : null,
      })),
    }),
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category: "EDUCATION",
        confidence: 1,
      })),
    }),
    // Fixed responses preserve MATCH evidence even for disabled/readonly or
    // manual/no-write-plan candidates, as in structure-loop.test.ts.
    analyzeGenericFields: async (request) => {
      requests.push(
        request.sections.flatMap((section) =>
          section.fields.map((field) => field.candidateId),
        ),
      );
      return {
        schemaVersion: 3,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        diagnostics: { jevCalls: 0, elapsedMs: 0 },
        fields: request.sections.flatMap((section) =>
          section.fields.map((field): ResponseField => {
            const original = candidates.find(
              (candidate) => candidate.candidateId === field.candidateId,
            )!;
            const key =
              original.visibility === "hidden"
                ? fixture.otherKey
                : field.candidateId === schoolId && scenario !== "zero-visible"
                  ? HIGH_SCHOOL_KEY
                  : conflict && field.candidateId === conflictId
                    ? fixture.otherKey
                    : null;
            return {
              candidateId: field.candidateId,
              profileFieldKey: key,
              confidence: 0.95,
              categoryConfirmed: true,
              autofillPolicy: "ALLOWED",
              interactionStatus:
                scenario === "manual" && field.candidateId === conflictId
                  ? "MANUAL_REVEAL_REQUIRED"
                  : "READY",
              ...(scenario === "manual" && field.candidateId === conflictId
                ? {}
                : { writePlan: { command: "SET_TEXT" as const } }),
            };
          }),
        ),
      };
    },
  };
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "synthetic-high-school",
      sectionId: "highSchool",
      values: { schoolName: SYNTHETIC_SCHOOL },
    },
  ];
  const loop = await runGenericStructureLoop({
    document,
    profile,
    apiClient: client,
  });
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.flat()).toContain(hiddenId);
  const snapshot = bindGenericStructureRows(
    collectFieldsSnapshot(document, new Map(), {
      mixedSectionDetection: false,
    }),
    loop.context,
  );
  const result = await analyzeGenericFields(
    snapshot,
    document,
    client as GenericAnalysisApi,
    profile,
    createGenericAnalysisCache(),
  );
  const analysis = applyGenericStructureAnalysis(
    result.analysis,
    snapshot,
    loop.context,
  );
  expect(controls.map((control) => control.value)).toEqual(before);
  return {
    loop,
    snapshot,
    result,
    analysis,
    profile,
    school,
    hidden,
    unapproved,
    schoolId,
    hiddenId,
    controls,
    before,
  };
}

it("keeps a hidden-first radio group with a visible other-stage member fail-closed", async () => {
  const run = await analyze(
    {
      name: "mixed visibility radio row",
      html: () => `<section><h3>학력</h3><table><tbody>
        <tr data-repeatable-group><td>${stageSelect}</td>
        <td><label>고등학교 학교명<input name="school"></label></td>
        <td><label>확인<input name="unapproved"></label></td>
        <td><div hidden><label>전공 A<input type="radio" name="major" value="a"></label></div>
        <label>전공 B<input type="radio" name="major" value="b"></label></td>
        </tr></tbody></table></section>`,
      school: "[name=school]",
      hidden: "[name=major]",
      otherKey: "education.university.majorName",
    },
    "hidden-only",
  );
  const lookup = run.snapshot.registry.lookupField(run.hiddenId);
  expect("handle" in lookup && lookup.handle.elements).toEqual(
    Array.from(document.querySelectorAll('[name="major"]')),
  );
  expect(run.loop.actions).toContainEqual(
    expect.objectContaining({
      kind: "SELECT_ROW_KIND",
      result: "blocked",
      reason: "STAGE_KEY_MISMATCH",
      rowIndex: 0,
    }),
  );
  expect([...run.loop.context.blockedScopes.values()]).toContain(
    "STAGE_KEY_MISMATCH",
  );
  expect(run.result.grades.get(run.schoolId)).toEqual({
    grade: "BLOCKED",
    reason: "MIXED_EDUCATION_RECORD",
  });
});

describe.each(fixtures)("$name stage visibility", (fixture) => {
  it("1 ignores only hidden other-stage keys and maps visible high school without writes", async () => {
    const run = await analyze(fixture, "hidden-only");
    expect(run.loop.actions).toContainEqual(
      expect.objectContaining({
        kind: "SELECT_ROW_KIND",
        result: "done",
      }),
    );
    expect(run.loop.context.blockedScopes.size).toBe(0);
    expect(
      run.analysis.fields.find((field) => field.candidateId === run.schoolId),
    ).toMatchObject({
      matchType: "MATCH",
      valueBinding: { profileFieldKey: HIGH_SCHOOL_KEY },
    });
    expect(
      run.analysis.fields.find((field) => field.candidateId === run.hiddenId),
    ).toMatchObject({ matchType: "NO_MATCH" });
  });

  it.each([
    ["2 visible writable", "writable"],
    ["3a visible disabled", "disabled"],
    ["3b visible readonly", "readonly"],
    ["3c visible manual without writePlan", "manual"],
  ] as const)(
    "%s other-stage key keeps STAGE_KEY_MISMATCH without writes",
    async (_, scenario) => {
      const run = await analyze(fixture, scenario);
      expect(run.loop.actions).toContainEqual(
        expect.objectContaining({
          result: "blocked",
          reason: "STAGE_KEY_MISMATCH",
          rowIndex: 0,
        }),
      );
      expect([...run.loop.context.blockedScopes.values()]).toContain(
        "STAGE_KEY_MISMATCH",
      );
    },
  );

  it("4 blocks zero visible keys even when hidden keys exist without writes", async () => {
    const run = await analyze(fixture, "zero-visible");
    expect(run.loop.actions).toContainEqual(
      expect.objectContaining({
        result: "blocked",
        reason: "STAGE_KEY_MISMATCH",
        rowIndex: 0,
      }),
    );
  });

  it("5 writes only approved AUTO high-school mapping through the real settled writer", async () => {
    const run = await analyze(fixture, "hidden-only");
    const plan = buildReviewPlan({
      analysis: run.analysis,
      profile: run.profile,
      registry: run.snapshot.registry,
    });
    const items = plan.items.map((item) =>
      applyGenericStructureReview(
        applyGenericGrade(item, run.result.grades.get(item.candidateId)),
        run.snapshot,
        run.loop.context,
      ),
    );
    const approved = approvedReviewExecution(items, new Set());
    expect(
      items.find((item) => item.candidateId === run.schoolId),
      JSON.stringify(run.result.grades.get(run.schoolId)),
    ).toMatchObject({ genericGrade: "AUTO", selected: true, disabled: false });
    expect(approved.approvedCandidateIds).toEqual(new Set([run.schoolId]));
    const writes = await executeApprovedWritesAfterPageSettles({
      items: approved.executableReviewItems,
      approvedCandidateIds: approved.approvedCandidateIds,
      registry: run.snapshot.registry,
      document,
    });
    expect(writes).toContainEqual(
      expect.objectContaining({
        candidateId: run.schoolId,
        status: "written",
      }),
    );
    expect(run.school.value).toBe(SYNTHETIC_SCHOOL);
    for (const [index, control] of run.controls.entries())
      if (control !== run.school) expect(control.value).toBe(run.before[index]);
    expect(run.hidden.value).toBe("synthetic-hidden-keep");
    expect(run.unapproved.value).toBe("synthetic-unapproved-keep");
  });
});
