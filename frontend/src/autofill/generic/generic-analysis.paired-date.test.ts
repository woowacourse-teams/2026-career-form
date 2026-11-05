import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { GenericFieldsRequest } from "../api/types";
import { validateGenericFieldsResponse } from "../api/validate-generic-response";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  genericGradeFor,
} from "./generic-analysis";

afterEach(() => document.body.replaceChildren());

const START_KEY = "education.university.startDate";
const END_KEY = "education.university.endDate";
const input = (name: string) =>
  `<input name="${name}" aria-label="${name}" placeholder="YYYY-MM">`;

async function analyze(
  html: string,
  { inferred = false, mapped = true, planned = true } = {},
) {
  document.body.innerHTML = `<section><h2>Education</h2>${html}</section>`;
  const profile = createEmptyProfile();
  profile.education.push({
    id: "synthetic-university",
    sectionId: "university",
    values: { startDate: "2020-03-01", endDate: "2024-02-01" },
  });
  const snapshot = collectFieldsSnapshot(document);
  let startId = "";
  let sent: GenericFieldsRequest | undefined;
  const result = await analyzeGenericFields(
    snapshot,
    document,
    {
      classifySections: async (request) => ({
        schemaVersion: 1,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        sections: request.sections.map(({ sectionId }) => ({
          sectionId,
          category: "EDUCATION",
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
            section.fields.map((field) => {
              const start = field.domName === "start";
              if (start) startId = field.candidateId;
              return {
                candidateId: field.candidateId,
                profileFieldKey: start ? (mapped ? START_KEY : null) : END_KEY,
                confidence: 0.95,
                categoryConfirmed: true,
                ...(!start || mapped ? { autofillPolicy: "ALLOWED" as const } : {}),
                ...(start && inferred ? { inference: "PAIRED_DATE" as const } : {}),
                ...(start && (!planned || !mapped)
                  ? { interactionStatus: "BLOCKED" as const }
                  : {
                      interactionStatus: "READY" as const,
                      writePlan: { command: "SELECT_DATE" as const },
                    }),
              };
            }),
          ),
          diagnostics: { jevCalls: 1, elapsedMs: 0 },
        });
      },
    },
    profile,
    createGenericAnalysisCache(),
  );
  expect(startId).not.toBe("");
  return {
    field: result.analysis.fields.find((field) => field.candidateId === startId),
    grade: genericGradeFor(result, startId),
    sent: sent!,
  };
}

describe("backend paired start-date inference", () => {
  const pair = `<div>${input("start")}${input("end")}</div>`;

  it("grades the backend inference as REVIEW while retaining its write plan", async () => {
    const result = await analyze(pair, { inferred: true });
    expect(result.field).toMatchObject({
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey: START_KEY },
      writePlan: { command: "SELECT_DATE" },
    });
    expect(result.grade).toEqual({
      grade: "REVIEW",
      reason: "PAIRED_DATE_INFERRED",
    });
  });

  it("keeps ordinary mapped dates AUTO when the marker is absent", async () => {
    expect((await analyze(pair)).grade).toMatchObject({ grade: "AUTO" });
  });

  it("does not infer locally when the backend abstains", async () => {
    expect((await analyze(pair, { mapped: false })).field)
      .toMatchObject({ matchType: "NO_MATCH" });
  });

  it("does not borrow a partner plan when the inferred date has no plan", async () => {
    const result = await analyze(pair, { inferred: true, planned: false });
    expect(result.field).not.toHaveProperty("writePlan");
    expect(result.grade).toEqual({ grade: "BLOCKED", reason: "WRITE_PLAN_BLOCKED" });
  });

  it("sends the shared container identity for exactly two inputs in order", async () => {
    const { sent } = await analyze(pair);
    const fields = sent.sections.flatMap((section) => section.fields);
    expect(fields.map((field) => field.domName)).toEqual(["start", "end"]);
    expect(fields[0]!.containerId).toBeDefined();
    expect(fields[1]!.containerId).toBe(fields[0]!.containerId);
  });

  it("does not describe a three-control container as a pair", async () => {
    const { sent } = await analyze(
      `<div>${input("start")}${input("end")}${input("third")}</div>`,
    );
    expect(sent.sections.flatMap((section) => section.fields))
      .toSatisfy((fields: Array<{ containerId?: string }>) =>
        fields.every((field) => field.containerId === undefined));
  });
});
