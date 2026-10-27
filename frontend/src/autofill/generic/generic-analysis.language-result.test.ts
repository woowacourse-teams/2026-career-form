import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { validateGenericFieldsResponse } from "../api/validate-generic-response";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  genericGradeFor,
} from "./generic-analysis";

afterEach(() => document.body.replaceChildren());

const KEY = "languages.languageTest.grade";

async function analyze(storedResult: string) {
  document.body.innerHTML = `<section><h2>Language</h2><div>
    <input name="test" aria-label="시험">
    <select name="level" aria-label="등급"><option value="">등급</option><option value="a">A</option><option value="b">B</option></select>
    <input name="score" aria-label="점수"></div></section>`;
  const profile = createEmptyProfile();
  profile.languages.push({
    id: "synthetic-language",
    sectionId: "languageTest",
    values: { testName: "공개 시험", grade: storedResult },
  });
  const ids: Record<string, string> = {};
  const result = await analyzeGenericFields(
    collectFieldsSnapshot(document),
    document,
    {
      classifySections: async (request) => ({
        schemaVersion: 1,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        sections: request.sections.map(({ sectionId }) => ({
          sectionId,
          category: "LANGUAGE",
          confidence: 1,
        })),
      }),
      analyzeGenericFields: async (request) =>
        validateGenericFieldsResponse(request, {
          schemaVersion: 3,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          fields: request.sections.flatMap((section) =>
            section.fields.map((field) => {
              ids[field.domName ?? ""] = field.candidateId;
              const select = field.domName === "level";
              const result = select || field.domName === "score";
              return {
                candidateId: field.candidateId,
                profileFieldKey: result ? KEY : "languages.languageTest.testName",
                confidence: 0.9,
                categoryConfirmed: true,
                autofillPolicy: "ALLOWED" as const,
                interactionStatus: "READY" as const,
                writePlan: { command: select ? ("SELECT_OPTION" as const) : ("SET_TEXT" as const) },
                ...(result
                  ? { inference: select ? ("LANGUAGE_GRADE" as const) : ("LANGUAGE_SCORE" as const) }
                  : {}),
              };
            }),
          ),
          diagnostics: { jevCalls: 1, elapsedMs: 0 },
        }),
    },
    profile,
    createGenericAnalysisCache(),
  );
  const field = (name: string) =>
    result.analysis.fields.find((entry) => entry.candidateId === ids[name]);
  return { field, grade: (name: string) => genericGradeFor(result, ids[name]!) };
}

describe("backend language score/grade target candidates", () => {
  it("keeps only the score input for a numeric stored result, as REVIEW", async () => {
    const result = await analyze("850");
    expect(result.field("score")).toMatchObject({ matchType: "MATCH" });
    expect(result.grade("score")).toEqual({ grade: "REVIEW", reason: "LANGUAGE_RESULT_INFERRED" });
    expect(result.field("level")).toMatchObject({ matchType: "NO_MATCH" });
  });

  it("keeps only the grade select for a non-numeric stored result", async () => {
    const result = await analyze("B");
    expect(result.field("level")).toMatchObject({ matchType: "MATCH" });
    expect(result.grade("level")).toMatchObject({ grade: "REVIEW" });
    expect(result.field("score")).toMatchObject({ matchType: "NO_MATCH" });
  });
});
