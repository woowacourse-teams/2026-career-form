import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { GenericFieldsRequest, SectionClassifyRequest } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  genericGradeFor,
} from "./generic-analysis";

const DATE_KEY = "certifications.certificate.acquisitionDate";
afterEach(() => document.body.replaceChildren());

describe("generic acquired-certificate dates", () => {
  it.each(["취득일/응시일", "취득/응시일", "취득일"])(
    "links and auto-selects all three acquired-certificate rows: %s",
    async (label) => {
      document.body.innerHTML = `<section><h2>자격증</h2><div>
        ${[0, 1, 2].map((index) => `<div data-repeater-item>
          <label>Name<input name="certificateName"></label>
          <div><label for="${index === 0 ? "date-0" : `missing-${index}`}">${label}</label>
            <input id="date-${index}" name="acquired" placeholder="${label}"
              class="hasDatepicker" readonly maxlength="10">
          </div>
        </div>`).join("")}
      </div></section><div class="ui-datepicker" style="display:none"></div>`;
      const profile = createEmptyProfile();
      profile.certifications = [0, 1, 2].map((index) => ({
        id: `synthetic-${index}`,
        sectionId: "certificate",
        values: { name: `synthetic-${index}`, acquisitionDate: "2024-01-01" },
      }));
      const snapshot = collectFieldsSnapshot(document);
      const result = await analyzeGenericFields(
        snapshot,
        document,
        {
          classifySections: async (request: SectionClassifyRequest) => ({
            schemaVersion: 1,
            snapshotId: request.snapshotId,
            status: "COMPLETE",
            sections: request.sections.map(({ sectionId }) => ({
              sectionId,
              category: "CERTIFICATE",
              confidence: 1,
            })),
          }),
          // The backend service regression exercises both raw provider outcomes.
          // This is its canonical, policy-checked deterministic API response.
          analyzeGenericFields: async (request: GenericFieldsRequest) => ({
            schemaVersion: 3,
            snapshotId: request.snapshotId,
            status: "COMPLETE",
            fields: request.sections.flatMap((section) => section.fields.map((field) => ({
              candidateId: field.candidateId,
              profileFieldKey: field.readonly ? DATE_KEY : "certifications.certificate.name",
              confidence: 1,
              categoryConfirmed: true,
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              writePlan: { command: field.readonly ? "SELECT_DATE" : "SET_TEXT" },
            }))),
            diagnostics: { jevCalls: 1, elapsedMs: 0 },
          }),
        },
        profile,
        createGenericAnalysisCache(),
      );
      const plan = buildReviewPlan({ analysis: result.analysis, profile, registry: snapshot.registry });
      const dates = snapshot.request.sections.flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ]).filter((field) => field.readonly);
      expect(dates).toHaveLength(3);
      for (const [index, { candidateId }] of dates.entries()) {
        expect(result.analysis.fields.find((field) => field.candidateId === candidateId)).toMatchObject({
          matchType: "MATCH",
          valueBinding: { type: "DIRECT", profileFieldKey: DATE_KEY },
          writePlan: { command: "SELECT_DATE" },
        });
        expect(genericGradeFor(result, candidateId)).toEqual({ grade: "AUTO" });
        expect(plan.items.find((item) => item.candidateId === candidateId)).toMatchObject({
          profileFieldKey: DATE_KEY,
          profileEntryId: `synthetic-${index}`,
          itemIndex: index,
          status: "available",
          selected: true,
          disabled: false,
          dayCalendarApproval: { itemIndex: index, profileEntryId: `synthetic-${index}` },
        });
      }
    },
  );
});
