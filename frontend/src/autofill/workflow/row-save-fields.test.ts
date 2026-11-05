import { afterEach, describe, expect, it } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/write-result";
import { rowSaveFields } from "./row-save-fields";

afterEach(() => document.body.replaceChildren());

const NAME = "certifications.certificate.name";
const ISSUER = "certifications.certificate.issuer";

function item(
  candidateId: string,
  profileFieldKey: string,
  command: "SEARCH_SELECTION" | "SET_TEXT",
  { currentValue = "", itemIndex = 0 } = {},
): ReviewPlanItem {
  const analysis: MatchedFieldAnalysis = {
    candidateId,
    matchType: "MATCH",
    profileFieldKey,
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command },
  };
  return {
    candidateId,
    fieldLabel: candidateId,
    profileFieldKey,
    itemIndex,
    currentValue,
    profileValue: "합성값",
    previewValue: "합성값",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "테스트",
    analysis,
  } as ReviewPlanItem;
}

function registryFor(ids: string[]) {
  const registry = new CandidateRegistry();
  for (const id of ids) {
    const input = document.createElement("input");
    document.body.append(input);
    registry.registerField({
      kind: "field",
      candidateId: id,
      candidate: {
        candidateId: id,
        element: "input",
        control: "text",
        visibility: "visible",
      },
      elements: [input],
      optionElements: new Map(),
      sectionId: "section-1",
      signature: createStructuralSignature([input]),
    });
  }
  return registry;
}

const writtenResult = (candidateId: string): ApprovedWriteResult => ({
  candidateId,
  status: "written",
  outcome: "success",
  code: "WRITTEN",
});
const skippedResult = (
  candidateId: string,
  code: "CONFLICT" | "EXECUTION_FAILED",
): ApprovedWriteResult => ({
  candidateId,
  status: "skipped",
  outcome: code === "CONFLICT" ? "needs-verification" : "failed",
  code,
  reason: "테스트",
});

function run(items: ReviewPlanItem[], passResults: ApprovedWriteResult[]) {
  return rowSaveFields({
    items,
    approvedIds: new Set(items.map(({ candidateId }) => candidateId)),
    passResults,
    registry: registryFor(items.map(({ candidateId }) => candidateId)),
    wasWritten: () => false,
  });
}

describe("rowSaveFields conflict after a search selection", () => {
  it("settles a field the site filled right after the search in its row", () => {
    const fields = run(
      [
        item("name", NAME, "SEARCH_SELECTION"),
        item("issuer", ISSUER, "SET_TEXT"),
      ],
      [writtenResult("name"), skippedResult("issuer", "CONFLICT")],
    );
    expect(fields[1]).toMatchObject({ settled: true, written: false });
  });

  it("keeps a field that already held a value when it was reviewed", () => {
    const fields = run(
      [
        item("name", NAME, "SEARCH_SELECTION"),
        item("issuer", ISSUER, "SET_TEXT", { currentValue: "합성기관" }),
      ],
      [writtenResult("name"), skippedResult("issuer", "CONFLICT")],
    );
    expect(fields[1]).toMatchObject({ settled: false, written: false });
  });

  it("keeps the conflict when the search did not write", () => {
    const fields = run(
      [
        item("name", NAME, "SEARCH_SELECTION"),
        item("issuer", ISSUER, "SET_TEXT"),
      ],
      [
        skippedResult("name", "EXECUTION_FAILED"),
        skippedResult("issuer", "CONFLICT"),
      ],
    );
    expect(fields[1]).toMatchObject({ settled: false });
  });

  it("keeps the conflict when the search comes after the field", () => {
    const fields = run(
      [
        item("issuer", ISSUER, "SET_TEXT"),
        item("name", NAME, "SEARCH_SELECTION"),
      ],
      [skippedResult("issuer", "CONFLICT"), writtenResult("name")],
    );
    expect(fields[0]).toMatchObject({ settled: false });
  });

  it("keeps the conflict when the search belongs to another record", () => {
    const otherRow = run(
      [
        item("name", NAME, "SEARCH_SELECTION", { itemIndex: 1 }),
        item("issuer", ISSUER, "SET_TEXT"),
      ],
      [writtenResult("name"), skippedResult("issuer", "CONFLICT")],
    );
    expect(otherRow[1]).toMatchObject({ settled: false });
    const otherSection = run(
      [
        item("name", "careers.career.companyName", "SEARCH_SELECTION"),
        item("issuer", ISSUER, "SET_TEXT"),
      ],
      [writtenResult("name"), skippedResult("issuer", "CONFLICT")],
    );
    expect(otherSection[1]).toMatchObject({ settled: false });
  });
});
