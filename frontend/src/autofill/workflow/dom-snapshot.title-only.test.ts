import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "../generic/generic-analysis";

afterEach(() => document.body.replaceChildren());

const fixtures = [
  ["ahnlab-write-resume-form", "#birthday", "#englishName", undefined],
  ["sk-careers-application-form", 'input[title="생년월일"]', "#prsEmail", "#applyContentUserInfo"],
] as const;

function load(fixture: string, scope?: string) {
  document.body.innerHTML = readFileSync(join(
    process.cwd(), "fixtures/dom-snapshots", fixture, "sanitized.html",
  ), "utf8");
  if (scope) {
    // Keep the original personal section and its ancestors, without collecting
    // unrelated education/career rows in each name-cue regression.
    const section = document.querySelector(scope)!;
    section.parentElement!.replaceChildren(section);
  }
}

function collect() {
  const snapshot = collectFieldsSnapshot(document, undefined, { titleNameCues: true });
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const fieldFor = (element: HTMLInputElement | HTMLSelectElement) => fields.find((field) => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    return "handle" in lookup && lookup.handle.elements.includes(element);
  })!;
  return { snapshot, fields, fieldFor };
}

function birthDateApi(candidateId: string): GenericAnalysisApi {
  return {
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId, category: "PERSONAL", confidence: 1,
      })),
    }),
    analyzeGenericFields: async (request) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      fields: request.sections.flatMap((section) => section.fields.map((field) => ({
        candidateId: field.candidateId,
        profileFieldKey: field.candidateId === candidateId ? "personal.personal.birthDate" : null,
        confidence: 1,
        categoryConfirmed: true,
        ...(field.candidateId === candidateId ? {
          interactionStatus: "READY" as const,
          autofillPolicy: "ALLOWED" as const,
          writePlan: { command: "SET_TEXT" as const },
        } : { interactionStatus: "BLOCKED" as const }),
      }))),
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
    }),
  };
}

// Generic collection only, without company policy. Responses are synthetic
// matching evidence, not a claim about live JEV or real calendar visibility.
describe.each(fixtures)("%s generic name cues", (fixture, birthSelector, labelledSelector, scope) => {
  it("keeps an already labelled control's request labels unchanged", () => {
    load(fixture, scope);
    const input = document.querySelector<HTMLInputElement>(labelledSelector)!;
    const before = collect().fieldFor(input).semanticContext?.labels;
    expect(before?.some((label) => label.source === "label")).toBe(true);
    input.title = "추가 이름 단서";
    expect(collect().fieldFor(input).semanticContext?.labels).toEqual(before);
  }, 30_000);

  it("sends the birth-date cue and grades a mocked birthDate match AUTO", async () => {
    load(fixture, scope);
    const { snapshot, fieldFor } = collect();
    const input = document.querySelector<HTMLInputElement>(birthSelector);
    expect(input).not.toBeNull();
    if (!input) throw new Error(`Missing birth-date control: ${birthSelector}`);
    const field = fieldFor(input);
    expect(field).toBeDefined();
    expect(field.semanticContext?.labels?.some((label) => label.text.includes("생년월일"))).toBe(true);
    const profile = createEmptyProfile();
    profile.personal.birthDate = "2000-01-02";
    const result = await analyzeGenericFields(
      snapshot, document, birthDateApi(field.candidateId), profile, createGenericAnalysisCache(),
    );
    expect(result.grades.get(field.candidateId)?.grade).toBe("AUTO");
  }, 30_000);
});

it("includes the AhnLab title-only postal control's name in the request", () => {
  load("ahnlab-write-resume-form");
  const input = document.querySelector<HTMLInputElement>('input[title="우편번호"]')!;
  expect(input.labels).toHaveLength(0);
  expect(input.getAttribute("aria-label")).toBeNull();
  expect(input.getAttribute("aria-labelledby")).toBeNull();
  expect(input.getAttribute("placeholder")).toBeNull();
  expect(collect().fieldFor(input).semanticContext?.labels).toContainEqual({
    source: "label", text: "우편번호",
  });
}, 30_000);

it("preserves the recovered SK birth-date label instead of adding its title", () => {
  load("sk-careers-application-form", "#applyContentUserInfo");
  const input = document.querySelector<HTMLInputElement>('input[title="생년월일"]')!;
  const before = collect().fieldFor(input).semanticContext?.labels;
  expect(before).toContainEqual({ source: "label", text: "생년월일 *" });
  expect(before).not.toContainEqual({ source: "label", text: "생년월일" });
  input.removeAttribute("title");
  expect(collect().fieldFor(input).semanticContext?.labels).toEqual(before);
}, 30_000);

it("collects the preserved hidden SK select through title fallback only", () => {
  load("sk-careers-application-form");
  const select = document.querySelector<HTMLSelectElement>("#prsMilitarySvcStatus");
  expect(select).not.toBeNull();
  if (!select) throw new Error("Missing preserved SK military status select");
  const hiddenBranch = select.closest(".military-data[hidden]");
  const question = select.closest(".selectric-container");
  expect(hiddenBranch).not.toBeNull();
  expect(question).not.toBeNull();
  if (!question) throw new Error("Missing preserved SK military status question");
  // Naming text remains in the original hidden subtree; it is not removed to
  // manufacture a title-only effective cue.
  expect(question.querySelector(".select-label")?.textContent).toContain("대상 분류");
  const originalQuestion = question.outerHTML;
  expect(select.labels).toHaveLength(0);
  expect(select.getAttribute("aria-label")).toBeNull();
  expect(select.getAttribute("aria-labelledby")).toBeNull();
  expect(select.getAttribute("placeholder")).toBeNull();

  const field = collect().fieldFor(select);
  expect(field).toBeDefined();
  expect(field.visibility).toBe("hidden");
  expect(field.semanticContext?.labels?.filter((label) =>
    ["label", "aria-label", "aria-labelledby", "placeholder"].includes(label.source),
  )).toEqual([{ source: "label", text: "대상 분류" }]);
  expect(question.outerHTML).toBe(originalQuestion);
  expect(hiddenBranch?.hasAttribute("hidden")).toBe(true);
}, 30_000);
