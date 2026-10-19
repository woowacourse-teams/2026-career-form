import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
} from "../dom/collect";
import {
  analyzeGenericFields,
  applyGenericGrade,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "../generic/generic-analysis";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWrites } from "../write/executor";

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

function mockApi(
  mappings: ReadonlyMap<string, string> = new Map(),
): GenericAnalysisApi {
  return {
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category: "PERSONAL",
        confidence: 1,
      })),
    }),
    analyzeGenericFields: async (request) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => {
          const key = mappings.get(field.candidateId);
          return {
            candidateId: field.candidateId,
            profileFieldKey: key ?? null,
            confidence: 1,
            categoryConfirmed: true,
            ...(key
              ? {
                  interactionStatus: "READY" as const,
                  autofillPolicy: "ALLOWED" as const,
                  writePlan: { command: "SET_TEXT" as const },
                }
              : { interactionStatus: "BLOCKED" as const }),
          };
        }),
      ),
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
    }),
  };
}

// Reviewed v4 structure only. API responses below are mocks, not evidence of
// live-site matching, local JEV output, or installed-extension behavior.
describe("AhnLab sanitized application form", () => {
  it("keeps broken single-control labels in the generic collection path", async () => {
    collect(() => {
      document
        .querySelector('label[for="englishName"]')!
        .setAttribute("for", "missing-target");
    });
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const fields = snapshot.request.sections.flatMap(
      (section) => section.fields,
    );
    expect(fields[0]?.displayName).toBe("영문이름");
    expect(fields[0]?.semanticContext?.labels).toContainEqual({
      source: "label",
      text: "영문이름",
    });
  });

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
    expect(additional.map((field) => field.control)).toEqual([
      "checkbox",
      "text",
    ]);
    expect(additional[0]?.options).toHaveLength(3);
    const result = await analyzeGenericFields(
      snapshot,
      document,
      mockApi(),
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

  it.each([
    ["original title", "contact.contact.addressLine1", "BLOCKED"],
    ["original title", "contact.contact.postalCode", "AUTO"],
    ["autocomplete mutation", "contact.contact.addressLine1", "BLOCKED"],
    ["autocomplete mutation", "contact.contact.postalCode", "AUTO"],
  ])(
    "applies %s with %s before review and writing",
    async (hint, key, expectedGrade) => {
      const { snapshot, postalField, postal } = collect(() => {
        if (hint === "autocomplete mutation")
          document.querySelector<HTMLInputElement>(
            'input[title="우편번호"]',
          )!.autocomplete = "postal-code";
      });
      const profile = createEmptyProfile();
      profile.contact.addressLine1 = "합성 기본주소";
      profile.contact.postalCode = "12345";
      const result = await analyzeGenericFields(
        snapshot,
        document,
        mockApi(new Map([[postalField.candidateId, key]])),
        profile,
        createGenericAnalysisCache(),
      );
      const grade = result.grades.get(postalField.candidateId);
      expect(grade?.grade).toBe(expectedGrade);
      if (expectedGrade === "BLOCKED")
        expect(grade?.reason).toBe("FORMAT_KEY_MISMATCH");
      const plan = buildReviewPlan({
        analysis: result.analysis,
        profile,
        registry: snapshot.registry,
      });
      const items = plan.items.map((item) =>
        applyGenericGrade(item, result.grades.get(item.candidateId)),
      );
      const item = items.find(
        (entry) => entry.candidateId === postalField.candidateId,
      )!;
      const events: string[] = [];
      postal.addEventListener("input", () => events.push("input"));
      postal.addEventListener("change", () => events.push("change"));
      if (expectedGrade === "BLOCKED") {
        expect(item).toMatchObject({ selected: false, disabled: true });
      }
      const writes = executeApprovedWrites({
        items,
        approvedCandidateIds: new Set([postalField.candidateId]),
        registry: snapshot.registry,
      });
      if (expectedGrade === "BLOCKED") {
        expect(postal.value).toBe("");
        expect(events).toEqual([]);
        expect(writes.every((write) => write.status !== "written")).toBe(true);
      } else {
        expect(postal.value).toBe("12345");
        expect(writes.some((write) => write.status === "written")).toBe(true);
      }
    },
  );

  it.each(["contact.contact.phoneNumber", "contact.contact.email"])(
    "blocks the referrer contact field matched to the applicant's own %s",
    async (key) => {
      const { snapshot, fields } = collect(() => {
        // The live field is disabled; enable it to prove the grade, not the
        // disabled state, keeps the applicant's value out.
        document.getElementById("anon-id-6")!.removeAttribute("disabled");
      });
      const target = document.getElementById("anon-id-6") as HTMLInputElement;
      const referrerField = fields.find((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return "handle" in lookup && lookup.handle.elements.includes(target);
      })!;
      expect(referrerField.displayName).toBe("추천인 연락처");
      const profile = createEmptyProfile();
      profile.contact.phoneNumber = "01012345678";
      profile.contact.email = "synthetic@example.com";
      const result = await analyzeGenericFields(
        snapshot,
        document,
        mockApi(new Map([[referrerField.candidateId, key]])),
        profile,
        createGenericAnalysisCache(),
      );
      expect(result.grades.get(referrerField.candidateId)).toEqual({
        grade: "BLOCKED",
        reason: "OTHER_PERSON_CONTEXT",
      });
      const plan = buildReviewPlan({
        analysis: result.analysis,
        profile,
        registry: snapshot.registry,
      });
      const items = plan.items.map((item) =>
        applyGenericGrade(item, result.grades.get(item.candidateId)),
      );
      expect(
        items.find((item) => item.candidateId === referrerField.candidateId),
      ).toMatchObject({ selected: false, disabled: true });
      const writes = executeApprovedWrites({
        items,
        approvedCandidateIds: new Set([referrerField.candidateId]),
        registry: snapshot.registry,
      });
      expect(target.value).toBe("");
      expect(writes.every((write) => write.status !== "written")).toBe(true);
    },
  );

  it("blocks a referrer name field matched to a Korean full name recipe", async () => {
    const { snapshot, fields } = collect(() => {
      // A name field labelled with the role word, in an enabled referrer area.
      document.querySelector('label[for="anon-id-4"]')!.textContent =
        "추천인 성명";
    });
    const target = document.getElementById("anon-id-4") as HTMLInputElement;
    const referrerName = fields.find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return "handle" in lookup && lookup.handle.elements.includes(target);
    })!;
    expect(referrerName.displayName).toBe("추천인 성명");
    const profile = createEmptyProfile();
    profile.personal.koreanFamilyName = "합성";
    profile.personal.koreanGivenName = "이름";
    const api = mockApi();
    const analyze = api.analyzeGenericFields;
    api.analyzeGenericFields = async (request) => {
      const response = await analyze(request);
      return {
        ...response,
        fields: response.fields.map((field) =>
          field.candidateId === referrerName.candidateId
            ? {
                ...field,
                confidence: 1,
                categoryConfirmed: true,
                interactionStatus: "READY" as const,
                autofillPolicy: "ALLOWED" as const,
                writePlan: { command: "SET_TEXT" as const },
                binding: {
                  type: "DERIVED" as const,
                  recipe: "KOREAN_FULL_NAME" as const,
                },
              }
            : field,
        ),
      };
    };
    const result = await analyzeGenericFields(
      snapshot,
      document,
      api,
      profile,
      createGenericAnalysisCache(),
    );
    expect(result.grades.get(referrerName.candidateId)).toEqual({
      grade: "BLOCKED",
      reason: "OTHER_PERSON_CONTEXT",
    });
    const plan = buildReviewPlan({
      analysis: result.analysis,
      profile,
      registry: snapshot.registry,
    });
    const items = plan.items.map((item) =>
      applyGenericGrade(item, result.grades.get(item.candidateId)),
    );
    expect(
      items.find((item) => item.candidateId === referrerName.candidateId),
    ).toMatchObject({ selected: false, disabled: true });
    const writes = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set([referrerName.candidateId]),
      registry: snapshot.registry,
    });
    expect(target.value).toBe("");
    expect(writes.every((write) => write.status !== "written")).toBe(true);
  });
});
