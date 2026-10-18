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

const FIXTURE = join(
  process.cwd(),
  "fixtures/dom-snapshots/ahnlab-write-resume-form/sanitized.html",
);

afterEach(() => document.body.replaceChildren());

function collect(mutate?: () => void) {
  document.body.innerHTML = readFileSync(FIXTURE, "utf8");
  mutate?.();
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const postal = document.querySelector<HTMLInputElement>(
    'input[title="우편번호"]',
  )!;
  const postalField = fields.find((field) => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    return "handle" in lookup && lookup.handle.elements.includes(postal);
  })!;
  return { snapshot, fields, postal, postalField };
}

// Reviewed v4 structure only. API responses below are mocks, not evidence of
// live-site matching, local JEV output, or installed-extension behavior.
describe("AhnLab sanitized application form", () => {
  it("collects the postal input without a display name and preserves its real format", () => {
    const { snapshot, fields, postalField } = collect();
    expect(document.querySelectorAll("input, select").length).toBe(48);
    expect(document.querySelectorAll("option").length).toBe(332);
    expect(document.querySelectorAll("label").length).toBe(48);
    expect(document.querySelectorAll("button").length).toBe(3);
    expect(snapshot.request.sections).toHaveLength(2);
    expect(fields).toHaveLength(38);
    expect(postalField).toBeDefined();
    expect(postalField.displayName).toBeUndefined();
    expect(postalField.semanticContext).toMatchObject({
      inputType: "text",
      maxLength: 126,
    });
    expect(postalField.semanticContext?.inputMode).toBeUndefined();
    expect(postalField.semanticContext?.autocomplete).toBeUndefined();
  });

  it("gains a postal display name only after an in-memory aria-label mutation", () => {
    const { postalField } = collect(() => {
      document
        .querySelector('input[title="우편번호"]')!
        .setAttribute("aria-label", "우편번호");
    });
    expect(postalField.displayName).toBe("우편번호");
    expect(postalField.semanticContext?.labels).toContainEqual({
      source: "aria-label",
      text: "우편번호",
    });
  });

  it("preserves additional questions as unmatched when the API abstains", async () => {
    const { snapshot, fields } = collect();
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (element) => element.textContent === "추가질문",
    )!;
    const additional = fields.filter((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        "handle" in lookup &&
        lookup.handle.elements.some((element) =>
          heading.parentElement!.contains(element),
        )
      );
    });
    expect(heading.parentElement!.querySelectorAll("input")).toHaveLength(4);
    expect(additional.map((field) => field.control)).toEqual(["checkbox", "text"]);
    expect(additional[0]?.options).toHaveLength(3);
    const api: GenericAnalysisApi = {
      classifySections: async (request) => ({
        schemaVersion: 1,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        sections: request.sections.map((section) => ({
          sectionId: section.sectionId,
          category: "NONE",
          confidence: 1,
        })),
      }),
      analyzeGenericFields: async (request) => ({
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        fields: request.sections.flatMap((section) =>
          section.fields.map((field) => ({
            candidateId: field.candidateId,
            profileFieldKey: null,
            confidence: 1,
            categoryConfirmed: true,
            interactionStatus: "BLOCKED",
          })),
        ),
        diagnostics: { jevCalls: 0, elapsedMs: 0 },
      }),
    };
    const result = await analyzeGenericFields(
      snapshot,
      document,
      api,
      createEmptyProfile(),
      createGenericAnalysisCache(),
    );
    for (const candidate of additional) {
      expect(
        result.analysis.fields.find(
          (field) => field.candidateId === candidate.candidateId,
        ),
      ).toMatchObject({ matchType: "NO_MATCH" });
    }
  });
});
