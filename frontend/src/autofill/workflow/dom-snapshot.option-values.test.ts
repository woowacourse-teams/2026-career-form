import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "../generic/generic-analysis";

const FIXTURES = join(process.cwd(), "fixtures/dom-snapshots");

afterEach(() => document.body.replaceChildren());

function mockApi(
  mappings: ReadonlyMap<string, string>,
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
                  writePlan: { command: "SELECT_OPTION" as const },
                }
              : { interactionStatus: "BLOCKED" as const }),
          };
        }),
      ),
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
    }),
  };
}

async function analyzeControl(
  fixture: string,
  controlSelector: string,
  profileFieldKey: string,
  profile: Profile,
) {
  document.body.innerHTML = readFileSync(
    join(FIXTURES, fixture, "sanitized.html"),
    "utf8",
  );
  const snapshot = collectFieldsSnapshot(document);
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(controlSelector)!;
  const field = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .find((candidate) => {
      const lookup = snapshot.registry.lookupField(candidate.candidateId);
      return "handle" in lookup && lookup.handle.elements.includes(control);
    })!;
  expect(field).toBeDefined();
  const result = await analyzeGenericFields(
    snapshot,
    document,
    mockApi(new Map([[field.candidateId, profileFieldKey]])),
    profile,
    createGenericAnalysisCache(),
  );
  return {
    grade: result.grades.get(field.candidateId),
    field: result.analysis.fields.find(
      (entry) => entry.candidateId === field.candidateId,
    ),
  };
}

const militaryProfile = (value: string): Profile => {
  const profile = createEmptyProfile();
  profile.military.militaryStatus = value;
  return profile;
};

const certificateGrade = (grade: string): Profile => {
  const profile = createEmptyProfile();
  profile.certifications.push({
    id: "entry-1",
    sectionId: "certificate",
    values: { grade },
  });
  return profile;
};

// Sanitized structure only; the API response is a mock, not live evidence.
describe("generic select and radio option values on sanitized fixtures", () => {
  it.each([
    ["ahnlab-write-resume-form", "#militaryType"],
    ["sk-careers-application-form", "#prsMilitarySvcStatus"],
  ])("converts the fixed military status label on %s", async (fixture, selector) => {
    const { grade, field } = await analyzeControl(
      fixture,
      selector,
      "military.military.militaryStatus",
      militaryProfile("military-status:served"),
    );

    expect(field).toMatchObject({
      valueBinding: {
        type: "LOOKUP",
        optionMap: { "military-status:served": "군필" },
      },
    });
    expect(grade).toEqual({ grade: "AUTO" });
  });

  it.each([
    ["ahnlab-write-resume-form", "#militaryType"],
    ["sk-careers-application-form", "#prsMilitarySvcStatus"],
  ])("blocks an unmatched military status on %s", async (fixture, selector) => {
    const { grade } = await analyzeControl(
      fixture,
      selector,
      "military.military.militaryStatus",
      militaryProfile("military-status:unknown"),
    );

    expect(grade).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });

  it("converts an exactly matching free-text grade on the grade select", async () => {
    const { grade, field } = await analyzeControl(
      "naver-step2-form",
      "#licenseGrd0",
      "certifications.certificate.grade",
      certificateGrade("A등급"),
    );

    expect(field).toMatchObject({
      valueBinding: { type: "LOOKUP", optionMap: { A등급: "A등급" } },
    });
    expect(grade).toEqual({ grade: "AUTO" });
  });

  // Existing sanitized snapshot provenance: SK #187, fixture review.md.
  // This free-text profile field has no fixed option set to mask exact matching.
  it("normalizes a free-text conversation level on an unrelated select fixture", async () => {
    const profile = createEmptyProfile();
    profile.languages.push({
      id: "entry-1",
      sectionId: "languageSkill",
      values: { conversationalLevel: " 상 " },
    });
    const { grade, field } = await analyzeControl(
      "sk-careers-application-form",
      '[name="lngabConversation"]',
      "languages.languageSkill.conversationalLevel",
      profile,
    );

    expect(field).toMatchObject({
      valueBinding: { type: "LOOKUP", optionMap: { " 상 ": "상" } },
    });
    expect(grade).toEqual({ grade: "AUTO" });
  });

  it("blocks a numeric score on an unrelated conversation level select", async () => {
    const profile = createEmptyProfile();
    profile.languages.push({
      id: "entry-1",
      sectionId: "languageSkill",
      values: { conversationalLevel: "850" },
    });
    const { grade } = await analyzeControl(
      "sk-careers-application-form",
      '[name="lngabConversation"]',
      "languages.languageSkill.conversationalLevel",
      profile,
    );

    expect(grade).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });

  it.each([
    ["a grade that is not an option", "#licenseGrd0", "Z등급"],
    ["a numeric score", "#licenseGrd0", "850"],
    ["a numeric score on the language grade", "#langGrd", "850"],
  ])("blocks %s on the grade select", async (_name, selector, value) => {
    const { grade } = await analyzeControl(
      "naver-step2-form",
      selector,
      selector === "#langGrd"
        ? "languages.languageTest.grade"
        : "certifications.certificate.grade",
      selector === "#langGrd"
        ? (() => {
            const profile = createEmptyProfile();
            profile.languages.push({
              id: "entry-1",
              sectionId: "languageTest",
              values: { grade: value },
            });
            return profile;
          })()
        : certificateGrade(value),
    );

    expect(grade).toEqual({
      grade: "BLOCKED",
      reason: "OPTION_VALUE_UNMATCHED",
    });
  });
});
