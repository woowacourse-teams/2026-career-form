import { describe, expect, it, vi } from "vitest";
import { QualityObservation } from "../../src/autofill/quality/observation";
import { CandidateRegistry } from "../../src/autofill/dom/candidate-registry";
import { collectFieldsSnapshot } from "../../src/autofill/dom/collect";
import type { ReviewPlanItem } from "../../src/autofill/review/review-plan";
import { buildReviewPlan } from "../../src/autofill/review/review-plan";
import type {
  GenericFieldsRequest,
  GenericFieldsResponse,
  SectionClassifyRequest,
} from "../../src/autofill/api/types";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
} from "../../src/autofill/generic/generic-analysis";
import { parseProfileImport } from "../../src/profile/profile-transfer";
import profileExport from "../profile-export.example.json";
import {
  fieldAnalysis,
  installClientAnalysisCollector,
  isFieldAnalysisEvent,
  fieldResponse,
  type ClientAnalysis,
} from "./collector.mjs";

describe("baseline analysis collection", () => {
  it("counts both field endpoints without counting classification as fields", () => {
    expect(
      [
        "AUTOFILL_ANALYZE_FIELDS",
        "AUTOFILL_GENERIC_CLASSIFY_SECTIONS",
        "AUTOFILL_GENERIC_ANALYZE_FIELDS",
      ].filter((type) => isFieldAnalysisEvent({ type })),
    ).toEqual(["AUTOFILL_ANALYZE_FIELDS", "AUTOFILL_GENERIC_ANALYZE_FIELDS"]);
  });

  it("preserves static response bindings and nested field identities", () => {
    const analysis = { candidateId: "field-1", matchType: "MATCH" };
    const result = fieldAnalysis([
      {
        type: "AUTOFILL_ANALYZE_FIELDS",
        request: {
          sections: [
            {
              fields: [],
              items: [{ fields: [{ candidateId: "field-1", domId: "c020" }] }],
            },
          ],
        },
        response: { fields: [analysis] },
      },
    ]);
    expect([...result.domIds.values()]).toEqual(["c020"]);
    expect([...result.analyses.values()]).toEqual([analysis]);
  });

  it("observes final client bindings using registry DOM identities and preserves callbacks", () => {
    document.body.innerHTML =
      '<form><label for="c001">성</label><input id="c001"></form>';
    const snapshot = collectFieldsSnapshot(document);
    const candidateId = snapshot.request.sections.flatMap(
      (section) => section.fields,
    )[0].candidateId;
    const quality = new QualityObservation(async () => undefined);
    const originalSnapshot = vi.spyOn(quality, "snapshot");
    const originalReview = vi.spyOn(quality, "review");
    const records: ClientAnalysis[] = [];
    installClientAnalysisCollector(quality, records);
    quality.snapshot("snapshot-1", snapshot.registry, [candidateId]);
    const analysis: NonNullable<ReviewPlanItem["analysis"]> = {
      candidateId,
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.koreanFamilyName",
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
    };
    const items = [{ candidateId, analysis }] as ReviewPlanItem[];
    quality.review("snapshot-1", items);
    expect(originalSnapshot).toHaveBeenCalledOnce();
    expect(originalReview).toHaveBeenCalledWith("snapshot-1", items);
    expect([...fieldAnalysis([], records).domIds.values()]).toEqual(["c001"]);
    expect([...fieldAnalysis([], records).analyses.values()]).toEqual([
      analysis,
    ]);
  });

  it("keeps discovered identities without a response and separates reused candidate IDs", () => {
    const result = fieldAnalysis(
      [],
      [
        {
          snapshotId: "one",
          domIds: { reused: "c001" },
          fields: [{ candidateId: "reused", matchType: "MATCH" }],
        },
        { snapshotId: "two", domIds: { reused: "c020", missing: "c021" } },
      ],
    );
    expect([...result.domIds.values()]).toEqual(["c001", "c020", "c021"]);
    expect(result.analyses.get("c001")?.matchType).toBe("MATCH");
    expect(result.analyses.has("c020")).toBe(false);
  });

  it("uses the last merged review even when it removes a previous raw match", () => {
    const events = [
      {
        type: "AUTOFILL_ANALYZE_FIELDS",
        request: {
          sections: [{ fields: [{ candidateId: "old", domId: "c001" }] }],
        },
        response: { fields: [{ candidateId: "old", matchType: "MATCH" }] },
      },
    ];
    const result = fieldAnalysis(events, [
      {
        snapshotId: "new",
        domIds: { latest: "c001" },
        fields: [{ candidateId: "latest", matchType: "NO_MATCH" }],
      },
    ]);
    expect([...result.domIds.values()]).toEqual(["c001"]);
    expect(result.analyses.get("c001")?.matchType).toBe("NO_MATCH");
  });

  it("does not invent DOM identities for unregistered candidates", () => {
    const quality = new QualityObservation(async () => undefined);
    const records: ClientAnalysis[] = [];
    installClientAnalysisCollector(quality, records);
    quality.snapshot("empty", new CandidateRegistry(), ["unknown"]);
    expect(fieldAnalysis([], records).domIds.size).toBe(0);
  });

  it("preserves failed endpoint codes and existing static warnings", () => {
    expect(
      fieldResponse({
        type: "AUTOFILL_GENERIC_ANALYZE_FIELDS",
        ok: false,
        code: "NETWORK",
      }),
    ).toMatchObject({
      ok: false,
      error_code: "NETWORK",
      fields: 0,
      matches: 0,
    });
    expect(
      fieldResponse({
        type: "AUTOFILL_ANALYZE_FIELDS",
        ok: true,
        response: {
          analysisStatus: "PARTIAL",
          warningCodes: ["LLM_UNAVAILABLE"],
        },
      }),
    ).toMatchObject({
      analysis_status: "PARTIAL",
      warning_codes: ["LLM_UNAVAILABLE"],
    });
  });

  it("retains actual generic DIRECT and LOOKUP fixture keys and missing/unavailable fields", async () => {
    document.body.innerHTML = `
      <form><h2>인적사항</h2>
        <label>성<input id="c001"></label>
        <label>국적<select id="c008"><option value="">선택</option><option value="KR">대한민국</option></select></label>
        <label>미연결<input id="c009"></label>
        <label>이메일<input id="c010"></label>
      </form>`;
    const snapshot = collectFieldsSnapshot(document);
    const profile = parseProfileImport(JSON.stringify(profileExport));
    const records: ClientAnalysis[] = [];
    const quality = new QualityObservation(async () => undefined);
    installClientAnalysisCollector(quality, records);
    const ids = snapshot.request.sections
      .flatMap((section) => section.fields)
      .map((field) => field.candidateId);
    quality.snapshot(snapshot.request.snapshotId, snapshot.registry, ids);
    let raw: GenericFieldsResponse | undefined;
    const result = await analyzeGenericFields(
      snapshot,
      document,
      {
        classifySections: async (request: SectionClassifyRequest) => ({
          schemaVersion: 1,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          sections: request.sections.map((section) => ({
            sectionId: section.sectionId,
            category: "personal",
            confidence: 0.99,
          })),
        }),
        analyzeGenericFields: async (request: GenericFieldsRequest) => {
          raw = {
            schemaVersion: 3,
            snapshotId: request.snapshotId,
            status: "COMPLETE",
            fields: request.sections.flatMap((section) =>
              section.fields.map((field) => ({
                candidateId: field.candidateId,
                profileFieldKey:
                  field.domId === "c001"
                    ? "personal.personal.koreanFamilyName"
                    : field.domId === "c008"
                      ? "personal.personal.nationality"
                      : null,
                confidence: 0.99,
                categoryConfirmed: true,
                autofillPolicy: "ALLOWED",
                interactionStatus:
                  field.domId === "c009" || field.domId === "c010"
                    ? "BLOCKED"
                    : "READY",
                ...(field.domId === "c010"
                  ? { reason: "LLM_UNAVAILABLE" as const }
                  : {}),
                writePlan: {
                  command:
                    field.domId === "c008"
                      ? ("SELECT_OPTION" as const)
                      : ("SET_TEXT" as const),
                },
              })),
            ),
            diagnostics: { jevCalls: 1, elapsedMs: 1 },
          };
          return raw;
        },
      },
      profile,
      createGenericAnalysisCache(),
    );
    quality.review(
      snapshot.request.snapshotId,
      buildReviewPlan({
        analysis: result.analysis,
        profile,
        registry: snapshot.registry,
      }).items,
    );
    const fields = fieldAnalysis([], records).analyses;
    expect(fields.get("c001")).toMatchObject({
      matchType: "MATCH",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "personal.personal.koreanFamilyName",
      },
    });
    expect(fields.get("c008")).toMatchObject({
      matchType: "MATCH",
      valueBinding: {
        type: "LOOKUP",
        profileFieldKey: "personal.personal.nationality",
      },
    });
    expect(fields.get("c009")?.matchType).toBe("NO_MATCH");
    expect(fields.get("c010")?.matchType).toBe("NO_MATCH");
    expect(fieldAnalysis([], records).domIds.size).toBe(4);
    expect(result.analysis.warningCodes).toContain("LLM_UNAVAILABLE");
    expect(
      fieldResponse({
        type: "AUTOFILL_GENERIC_ANALYZE_FIELDS",
        ok: true,
        response: raw,
      }).warning_codes,
    ).toContain("LLM_UNAVAILABLE");
  });
});
