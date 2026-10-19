import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsRequest } from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import * as mixed from "../dom/mixed-section-rows";
import { collectFieldsSnapshot } from "../dom/collect";
import { genericRowFor } from "../dom/repeatable-rows";
import { runGenericStructureLoop } from "./structure-loop";
import {
  applyGenericStructureAnalysis,
  bindGenericStructureRows,
} from "./structure-context";
import { analyzeGenericFields, createGenericAnalysisCache } from "./generic-analysis";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const profile: Profile = {
  ...createEmptyProfile(),
  education: [
    { id: "h", sectionId: "highSchool", values: { schoolName: "Synthetic secondary", location: "서울", startDate: "2017-03", endDate: "2020-02" } },
    { id: "u", sectionId: "university", values: { schoolType: "대학교", degreeLevel: "학사", schoolName: "Synthetic college", location: "서울", startDate: "2020-03", endDate: "2024-02" } },
  ],
};

function mount(source: string) {
  if (source === "sanitized") {
    document.body.innerHTML = readFileSync(join(process.cwd(), "fixtures/dom-snapshots/naver-step2-form/sanitized.html"), "utf8");
    const area = document.querySelector(".form_box")!;
    document.body.replaceChildren(area);
    const container = area.querySelector(".rcform_copy_prt")!;
    const row = container.querySelector(".rcform_copy")!;
    container.replaceChildren(row, row.cloneNode(true));
    const rows = [...container.children];
    rows.forEach((current, index) => {
      current.querySelectorAll(".schoolDiv").forEach((panel, panelIndex) => {
        panel.toggleAttribute("hidden", panelIndex !== index);
      });
      current.querySelectorAll<HTMLSelectElement>('select[name="scholarType"]').forEach((select) => {
        select.selectedIndex = index === 0 ? 1 : 3;
      });
      if (index > 0)
        current.querySelectorAll(".rcform_copyBtn").forEach((button) => button.remove());
    });
  } else {
    document.body.innerHTML = `<section><h2>학력</h2><div>${[0, 1].map((index) => `
      <article data-repeater-item>
        <label>단계<select><option value="">선택</option><option value="secondary">고등학교</option><option value="college">대학교</option><option value="postgrad">대학원(석사)</option></select></label>
        <label>소재지<input name="place${index}"></label><label>학교명<input name="school${index}"></label>
        <label>입학년월<input name="from${index}"></label><label>졸업년월<input name="until${index}"></label>
      </article>`).join("")}</div></section>`;
    document.querySelectorAll("select").forEach((select, index) => { select.selectedIndex = index + 1; });
  }
  return [...document.querySelectorAll<HTMLSelectElement>("select")].filter((select) =>
    !select.closest("[hidden]") && select.options[1]?.textContent === "고등학교",
  );
}

function api(abstain = false) {
  const requests: GenericFieldsRequest[] = [];
  const client = {
    analyzePreparation: vi.fn(async () => { throw new Error("Generic path only"); }),
    analyzeFields: vi.fn(async () => { throw new Error("Generic path only"); }),
    classifySections: vi.fn(async (request: Parameters<NonNullable<AnalysisApiClient["classifySections"]>>[0]): ReturnType<NonNullable<AnalysisApiClient["classifySections"]>> => ({
      schemaVersion: 1, snapshotId: request.snapshotId, status: "COMPLETE",
      sections: request.sections.map((section) => ({ sectionId: section.sectionId, category: "education", confidence: 1 })),
    })),
    decideInteractions: vi.fn(async (request: InteractionDecisionRequest): ReturnType<NonNullable<AnalysisApiClient["decideInteractions"]>> => ({
      schemaVersion: 2, snapshotId: request.snapshotId, mode: "GENERIC", status: "COMPLETE",
      decisions: request.decisions.map((decision) => {
        const text = { HIGH_SCHOOL: "고등학교", ASSOCIATE: "전문대학", BACHELOR: "대학교", MASTER: "대학원(석사)", DOCTOR: "대학원(박사)" }[decision.targetKind!];
        const candidate = !abstain && decision.candidates.find((item) => item.semanticContext?.labels?.[0]?.text === text);
        return { decisionId: decision.decisionId, role: decision.role, selection: candidate ? "SELECTED" : "ABSTAINED", candidateId: candidate ? candidate.candidateId : null };
      }),
    })),
    analyzeGenericFields: vi.fn(async (request: GenericFieldsRequest): ReturnType<NonNullable<AnalysisApiClient["analyzeGenericFields"]>> => {
      requests.push(request);
      return {
        schemaVersion: 3, snapshotId: request.snapshotId, status: "COMPLETE", diagnostics: { jevCalls: 0, elapsedMs: 0 },
        fields: request.sections.flatMap((section) => section.fields.map((field) => {
          const stage = field.semanticContext?.labels?.some((label) => label.text === "고등학교") ? "highSchool" : "university";
          const key = ({ "소재지": "location", "학교명": "schoolName", "입학년월": "startDate", "졸업년월": "endDate" } as Record<string, string>)[field.displayName ?? ""];
          return { candidateId: field.candidateId, profileFieldKey: key ? `education.${stage}.${key}` : null, confidence: .95, categoryConfirmed: true, autofillPolicy: "ALLOWED", interactionStatus: "READY",
            ...(key ? { writePlan: { command: "SET_TEXT" as const } } : {}) };
        })),
      };
    }),
  } satisfies AnalysisApiClient;
  return { client, requests };
}

describe("preselected generic education", () => {
  it.each(["sanitized", "synthetic"])("binds %s rows by stage without changing the selection", async (source) => {
    const selects = mount(source);
    const before = selects.map((select) => select.value);
    const changes = vi.fn();
    selects.forEach((select) => { select.addEventListener("input", changes); select.addEventListener("change", changes); });
    const detect = vi.spyOn(mixed, "detectMixedSectionGroup");
    const assign = vi.spyOn(mixed, "assignMixedRows");
    const service = api();
    const result = await runGenericStructureLoop({ document, profile, apiClient: service.client });
    expect(result.actions).toEqual([
      expect.objectContaining({ result: "done", rowIndex: 0 }),
      expect.objectContaining({ result: "done", rowIndex: 1 }),
    ]);
    expect([...result.context.educationRows.values()].map(({ sectionId, sectionIndex }) => [sectionId, sectionIndex]))
      .toEqual([["highSchool", 0], ["university", 0]]);
    expect(selects.map((select) => select.value)).toEqual(before);
    expect(changes).not.toHaveBeenCalled();
    expect(result.actions.map(({ result: outcome }) => outcome)).toEqual(["done", "done"]);
    expect(result.questions.filter(({ role }) => role === "ROW_KIND_OPTION")).toHaveLength(1);
    const snapshot = bindGenericStructureRows(collectFieldsSnapshot(document, new Map(), { mixedSectionDetection: false }), result.context);
    const analysis = await analyzeGenericFields(snapshot, document, service.client as Required<Pick<AnalysisApiClient, "classifySections" | "analyzeGenericFields">>, profile, createGenericAnalysisCache());
    const filtered = applyGenericStructureAnalysis(analysis.analysis, snapshot, result.context);
    for (const [index, select] of selects.entries()) {
      const row = genericRowFor(select)!;
      const handles = snapshot.request.sections.flatMap((section) => [...section.fields, ...(section.items ?? []).flatMap((item) => item.fields)])
        .flatMap((candidate) => {
          const lookup = snapshot.registry.lookupField(candidate.candidateId);
          return "handle" in lookup && row.contains(lookup.handle.elements[0]!) && ["소재지", "학교명", "입학년월", "졸업년월"].includes(candidate.displayName ?? "") ? [lookup.handle] : [];
        });
      expect(handles.length).toBeGreaterThanOrEqual(4);
      for (const handle of handles) {
        expect(handle.itemIndex).toBe(0);
        expect(handle.itemGroupId).toContain(`:stage:${index === 0 ? "highSchool" : "university"}`);
        expect(filtered.fields.find((field) => field.candidateId === handle.candidate.candidateId)?.matchType).toBe("MATCH");
        if (handle.candidate.displayName !== "소재지")
          expect(analysis.grades.get(handle.candidate.candidateId)?.reason).not.toBe("NO_PROFILE_VALUE");
      }
    }
    expect(service.requests.length).toBeGreaterThanOrEqual(3);
    expect(detect).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  }, 120_000);

  it("preserves a valid first option without emitting selection events", async () => {
    const selects = mount("synthetic");
    selects.forEach((select) => select.options[0]!.remove());
    const before = selects.map((select) => select.value);
    expect(selects[0]!.selectedIndex).toBe(0);
    const changed = vi.fn();
    selects.forEach((select) => {
      select.addEventListener("input", changed);
      select.addEventListener("change", changed);
    });
    const result = await runGenericStructureLoop({
      document,
      profile,
      apiClient: api().client,
    });
    expect(result.context.educationRows.size).toBe(2);
    expect(selects.map((select) => select.value)).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it("blocks a mismatched graduate row without rewriting or reassigning it", async () => {
    const selects = mount("synthetic");
    selects[1]!.value = "postgrad";
    const changed = vi.fn();
    selects[1]!.addEventListener("change", changed);
    const onAction = vi.fn();
    const result = await runGenericStructureLoop({ document, profile, apiClient: api().client, onAction });
    expect(result.actions).toContainEqual(expect.objectContaining({ rowIndex: 1, result: "blocked", reason: "ROW_KIND_MISMATCH" }));
    expect(result.context.educationRows.has(genericRowFor(selects[1]!)!)).toBe(false);
    expect(result.context.blockedScopes.get(genericRowFor(selects[1]!)!)).toBe("ROW_KIND_MISMATCH");
    expect(result.context.educationRows.size).toBe(1);
    expect(selects[1]!.value).toBe("postgrad");
    expect(changed).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ reason: "ROW_KIND_MISMATCH" }));
  });

  it("keeps undecided preselected options blocked and untouched", async () => {
    const selects = mount("synthetic");
    const result = await runGenericStructureLoop({ document, profile, apiClient: api(true).client });
    expect(result.actions.map(({ reason }) => reason)).toEqual(["ROW_KIND_OPTION_UNDECIDED", "ROW_KIND_OPTION_UNDECIDED"]);
    expect(selects.map((select) => select.value)).toEqual(["secondary", "college"]);
    expect(result.context.educationRows.size).toBe(0);
  });
});
