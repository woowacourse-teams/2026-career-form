import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { FieldsAnalyzeResponse } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import {
  applyGenericGrade,
  type GenericFieldGrade,
} from "../generic/generic-analysis";
import { buildReviewPlan } from "./review-plan";

function plan(
  entryCount: number,
  rowCount: number,
  indexed = true,
  grade: GenericFieldGrade = { grade: "AUTO" },
  grouped = true,
) {
  const profile = createEmptyProfile();
  profile.certifications = Array.from({ length: entryCount }, (_, index) => ({
    id: `certificate-${index}`,
    sectionId: "certificate",
    values: {
      name: `Certificate ${index}`,
      issuer: `Issuer ${index}`,
      acquisitionDate: `202${index}-01-02`,
    },
  }));
  const registry = new CandidateRegistry();
  const fields: FieldsAnalyzeResponse["fields"] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = document.createElement("div");
    row.dataset.repeatableGroup = "";
    document.body.append(row);
    for (const key of ["name", "issuer", "acquisitionDate"]) {
      const input = document.createElement("input");
      input.type = key === "acquisitionDate" ? "date" : "text";
      row.append(input);
      const candidateId = `${rowIndex}-${key}`;
      registry.registerField({
        kind: "field",
        candidateId,
        candidate: {
          candidateId,
          element: "input",
          control: "text",
          visibility: "visible",
          displayName: key,
        },
        elements: [input],
        optionElements: new Map(),
        sectionId: "certificates",
        ...(grouped ? { itemId: `row-${rowIndex}` } : {}),
        ...(grouped && indexed ? { itemIndex: rowIndex } : {}),
        signature: createStructuralSignature([input]),
      });
      fields.push({
        candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: `certifications.certificate.${key}`,
        },
        mappingStatus: "LLM_SUGGESTED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SET_TEXT" },
      });
    }
  }
  registry.setFieldItemCount("certificates", grouped ? rowCount : 0);
  return buildReviewPlan({
    profile,
    registry,
    analysis: {
      snapshotId: "single-row",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields,
    },
  }).items.map((item) => applyGenericGrade(item, grade));
}

describe("single remaining generic repeat row", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([true, false])(
    "binds every field to entry zero and includes it (indexed: %s)",
    (indexed) => {
      const items = plan(3, 1, indexed);
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item).toMatchObject({
          itemIndex: 0,
          profileEntryId: "certificate-0",
          genericGrade: "REVIEW",
          genericReasonCode: "FIRST_ENTRY_SINGLE_ROW",
          status: "available",
          disabled: false,
          selected: true,
        });
      }
      expect(items.map((item) => item.profileValue)).toEqual([
        "Certificate 0",
        "Issuer 0",
        "2020-01-02",
      ]);
    },
  );

  it("binds section direct fields without repeat rows to entry zero and includes them", () => {
    const items = plan(3, 1, true, { grade: "AUTO" }, false);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toMatchObject({
        itemIndex: 0,
        profileEntryId: "certificate-0",
        genericGrade: "REVIEW",
        genericReasonCode: "FIRST_ENTRY_SINGLE_ROW",
        status: "available",
        disabled: false,
        selected: true,
      });
    }
  });

  it("keeps indexed binding when all three rows are available", () => {
    const items = plan(3, 3);
    for (const [index, item] of items.entries()) {
      expect(item).toMatchObject({
        itemIndex: Math.floor(index / 3),
        profileEntryId: `certificate-${Math.floor(index / 3)}`,
        genericGrade: "AUTO",
        selected: true,
        disabled: false,
      });
      expect(item.genericReasonCode).toBeUndefined();
    }
  });

  it("keeps a single profile entry automatic", () => {
    for (const item of plan(1, 1)) {
      expect(item).toMatchObject({
        itemIndex: 0,
        profileEntryId: "certificate-0",
        genericGrade: "AUTO",
        selected: true,
        disabled: false,
      });
      expect(item.genericReasonCode).toBeUndefined();
    }
  });

  it("keeps mismatched multiple rows unavailable", () => {
    for (const item of plan(3, 2)) {
      expect(item).toMatchObject({
        status: "unavailable",
        disabled: true,
        selected: false,
      });
      expect(item.profileEntryId).toBeUndefined();
    }
  });

  it("retains the single-row reason over a general review grade", () => {
    for (const item of plan(3, 1, true, {
      grade: "REVIEW",
      reason: "MODERATE_CONFIDENCE",
    })) {
      expect(item).toMatchObject({
        genericGrade: "REVIEW",
        genericReasonCode: "FIRST_ENTRY_SINGLE_ROW",
        status: "needs-review",
        selected: false,
      });
    }
  });

  it("does not relax a blocked generic grade", () => {
    for (const item of plan(3, 1, true, {
      grade: "BLOCKED",
      reason: "LOW_CONFIDENCE",
    })) {
      expect(item).toMatchObject({
        genericGrade: "BLOCKED",
        genericReasonCode: "LOW_CONFIDENCE",
        disabled: true,
        selected: false,
      });
    }
  });
});
