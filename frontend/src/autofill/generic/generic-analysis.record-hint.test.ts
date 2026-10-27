import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type ProfileEntry } from "../../profile/model";
import type { GenericFieldsRequest } from "../api/types";
import { validateGenericFieldsResponse } from "../api/validate-generic-response";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
} from "./generic-analysis";

afterEach(() => document.body.replaceChildren());

const SINGLE_ROW = `<section><h2>Education</h2>
  <input name="kind" aria-label="kind" readonly>
  <input name="school" aria-label="school">
  <input name="scale" aria-label="scale">
</section>`;

async function sentSections(
  entries: ProfileEntry[],
  category = "EDUCATION",
  html = SINGLE_ROW,
): Promise<GenericFieldsRequest["sections"]> {
  document.body.innerHTML = html;
  const profile = createEmptyProfile();
  profile.education.push(...entries);
  let sent: GenericFieldsRequest | undefined;
  await analyzeGenericFields(
    collectFieldsSnapshot(document),
    document,
    {
      classifySections: async (request) => ({
        schemaVersion: 1,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        sections: request.sections.map(({ sectionId }) => ({
          sectionId,
          category,
          confidence: 1,
        })),
      }),
      analyzeGenericFields: async (request) => {
        sent = request;
        return validateGenericFieldsResponse(request, {
          schemaVersion: 3,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          fields: request.sections.flatMap((section) =>
            section.fields.map((field) => ({
              candidateId: field.candidateId,
              profileFieldKey: null,
              confidence: 0,
              categoryConfirmed: true,
              interactionStatus: "BLOCKED" as const,
            })),
          ),
          diagnostics: { jevCalls: 1, elapsedMs: 0 },
        });
      },
    },
    profile,
    createGenericAnalysisCache(),
  );
  expect(sent).toBeDefined();
  return sent!.sections;
}

const university = (values: Record<string, string> = {}): ProfileEntry => ({
  id: "synthetic-university",
  sectionId: "university",
  values: { schoolType: "대학교", ...values },
});
const highSchool: ProfileEntry = {
  id: "synthetic-high-school",
  sectionId: "highSchool",
  values: {},
};

describe("generic education record hint", () => {
  it("sends the only education record for a single-row education section", async () => {
    const sections = await sentSections([university()]);
    expect(sections.map((section) => section.recordSectionId)).toEqual([
      "university",
    ]);
  });

  it("sends the record selected by the latest education type", async () => {
    const sections = await sentSections([
      highSchool,
      university({ latestEducationType: "대학교" }),
    ]);
    expect(sections.map((section) => section.recordSectionId)).toEqual([
      "university",
    ]);
  });

  it("omits the hint when several records remain undecided", async () => {
    const sections = await sentSections([highSchool, university()]);
    expect(sections.every((section) => !("recordSectionId" in section))).toBe(
      true,
    );
  });

  it("omits the hint when the latest type matches several records", async () => {
    const sections = await sentSections([
      university({ latestEducationType: "대학교" }),
      { ...university(), id: "synthetic-university-2" },
    ]);
    expect(sections.every((section) => !("recordSectionId" in section))).toBe(
      true,
    );
  });

  it("omits the hint when the page has several education sections", async () => {
    const second = SINGLE_ROW.replace("Education", "Further education")
      .replaceAll('name="', 'name="second-')
      .replaceAll('aria-label="', 'aria-label="second ');
    const sections = await sentSections(
      [university()],
      "EDUCATION",
      `${SINGLE_ROW}${second}`,
    );
    expect(sections).toHaveLength(2);
    expect(sections.every((section) => !("recordSectionId" in section))).toBe(
      true,
    );
  });

  it("omits the hint outside education sections", async () => {
    const sections = await sentSections([university()], "CAREER");
    expect(sections.every((section) => !("recordSectionId" in section))).toBe(
      true,
    );
  });
});
