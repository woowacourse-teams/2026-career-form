import { beforeEach, afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import { validateFieldsResponse } from "../api/validate-response";
import { buildReviewPlan } from "./review-plan";
beforeEach(() =>
  (
    globalThis as unknown as {
      jsdom: { reconfigure(v: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://sample.career.greetinghr.com/ko/o/1/apply",
  }),
);
afterEach(() => document.body.replaceChildren());
function plan(profileRows = 1, fresh = true) {
  const base = "educationalBackground.universities.0";
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학교</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="${base}.schoolName"><input name="${base}.majors.1" data-scope="combobox" data-part="input" role="combobox" aria-controls="majors"><button name="${base}.majors.1.majorClassification" aria-controls="classification">주전공</button></div></div></div>`;
  const snapshot = collectFieldsSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((row) => row.fields),
  ]);
  const response = validateFieldsResponse(snapshot.request, {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates.map((field) => {
      const name = field.domName ?? "";
      const classification = name.endsWith(".majorClassification");
      return name.endsWith(".schoolName")
        ? {
            candidateId: field.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          }
        : {
            candidateId: field.candidateId,
            matchType: "MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            autofillPolicy: "ALLOWED",
            valueBinding: {
              type: "DERIVED",
              recipe: classification
                ? "UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION"
                : "UNIVERSITY_ADDITIONAL_MAJOR_1_NAME",
            },
            writePlan: {
              command: classification
                ? "SELECT_BUTTON_OPTION"
                : "SEARCH_SELECTION",
            },
          };
    }),
  });
  const profile = createEmptyProfile();
  for (let i = 0; i < profileRows; i++)
    profile.education.push({
      id: `u${i}`,
      sectionId: "university",
      values: { minorStatus: "있음", minorName: "통계학" },
    });
  return buildReviewPlan({
    profile,
    analysis: response,
    registry: snapshot.registry,
    freshDefaultCandidateIds: new Set(
      fresh
        ? candidates
            .filter((f) => f.domName?.endsWith(".majorClassification"))
            .map((f) => f.candidateId)
        : [],
    ),
  }).items.filter((item) => item.analysis?.matchType === "MATCH");
}
it("reviews minor-only composed name and fresh classification for the same university row", () => {
  const items = plan();
  expect(items).toHaveLength(2);
  expect(items.map((item) => item.profileValue).sort()).toEqual([
    "부전공",
    "통계학",
  ]);
  expect(items.every((item) => !item.disabled)).toBe(true);
});
it("rejects composed university bindings when form and profile row counts differ", () => {
  expect(plan(2).every((item) => item.disabled)).toBe(true);
});
it("protects an existing main-major classification without fresh provenance", () => {
  expect(
    plan(1, false).find((item) => item.profileValue === "부전공"),
  ).toMatchObject({ status: "conflict", selected: false });
});
