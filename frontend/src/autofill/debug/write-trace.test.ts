import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { beginWriteTrace, emitWriteTrace, traceHold } from "./write-trace";

const LABEL = "라벨-X9Q2";
const VALUE = "값-Z7K4-synthetic";
const SELECTOR_ID = "secret-selector-4F2";
const OPTION_TEXT = "옵션-R8M1";

function enableDiagnostics(dev = true) {
  vi.stubEnv("DEV", dev);
  vi.stubEnv("VITE_LOCAL_WORKFLOW_DIAGNOSTICS", "1");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
}

function analysis(
  candidateId: string,
  command: "SET_TEXT" | "SEARCH_SELECTION" | "SELECT_DATE" = "SET_TEXT",
): MatchedFieldAnalysis {
  return {
    candidateId,
    matchType: "MATCH",
    profileFieldKey: "contact.contact.email",
    autofillPolicy: "ALLOWED",
    mappingStatus: "LLM_SUGGESTED",
    interactionStatus: "READY",
    writePlan: { command },
  };
}

function item(
  candidateId: string,
  command: "SET_TEXT" | "SEARCH_SELECTION" | "SELECT_DATE" = "SET_TEXT",
): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: LABEL,
    currentValue: OPTION_TEXT,
    profileValue: VALUE,
    previewValue: VALUE,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: OPTION_TEXT,
    analysis: analysis(candidateId, command),
  };
}

const ROW_KEYS = [
  "writeOrdinal",
  "fieldOrdinal",
  "executor",
  "targetFound",
  "setterCalled",
  "valueAfterWrite",
  "valueAtSettle",
  "runState",
  "finalState",
  "code",
  "failureCode",
  "heldByBatchHalt",
  "haltKind",
  "haltTriggerOrdinal",
].sort();

beforeEach(() => {
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
  vi.spyOn(console, "groupEnd").mockImplementation(() => {});
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("write trace rows", () => {
  it("emits one value-free row per item from a real write run", async () => {
    enableDiagnostics();
    const input = document.createElement("input");
    input.id = SELECTOR_ID;
    input.setAttribute("aria-label", LABEL);
    document.body.append(input);
    const registry = new CandidateRegistry();
    registry.registerField({
      kind: "field",
      candidateId: "field-1",
      candidate: {
        candidateId: "field-1",
        element: "input",
        control: "text",
        visibility: "visible",
      },
      elements: [input],
      optionElements: new Map(),
      sectionId: "section-1",
      signature: createStructuralSignature([input]),
    });
    const table = vi.spyOn(console, "table").mockImplementation(() => {});

    await executeApprovedWritesAfterPageSettles({
      items: [item("field-1"), item("field-2")],
      approvedCandidateIds: new Set(["field-1"]),
      registry,
    });

    expect(input.value).toBe(VALUE);
    const traceCalls = table.mock.calls.filter((call) =>
      (call[0] as object[]).every((row) => "writeOrdinal" in row),
    );
    expect(traceCalls).toHaveLength(1);
    const rows = traceCalls[0]![0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]!).sort()).toEqual(ROW_KEYS);
    expect(rows[0]).toEqual({
      writeOrdinal: 1,
      fieldOrdinal: 1,
      executor: "native",
      targetFound: true,
      setterCalled: true,
      valueAfterWrite: true,
      valueAtSettle: true,
      runState: "written",
      finalState: "written",
      code: "WRITTEN",
      failureCode: "",
      heldByBatchHalt: false,
      haltKind: "",
      haltTriggerOrdinal: null,
    });
    expect(rows[1]).toMatchObject({
      writeOrdinal: null,
      fieldOrdinal: 2,
      targetFound: null,
      setterCalled: null,
      finalState: "skipped/needs-verification",
      code: "NOT_APPROVED",
    });
    const everything = JSON.stringify(table.mock.calls);
    for (const secret of [LABEL, VALUE, SELECTOR_ID, OPTION_TEXT])
      expect(everything).not.toContain(secret);
  });

  it("reports batch-level holds with the ordinal of the triggering item", () => {
    enableDiagnostics();
    const items = [item("field-1", "SEARCH_SELECTION"), item("field-2")];
    const results = [
      {
        candidateId: "field-1",
        status: "written" as const,
        outcome: "success" as const,
        code: "WRITTEN" as const,
      },
      {
        candidateId: "field-2",
        status: "skipped" as const,
        outcome: "needs-verification" as const,
        code: "STALE_TARGET" as const,
        failureCode: "SEARCH_FOLLOWUP_HALTED" as const,
        reason: OPTION_TEXT,
      },
    ];
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    beginWriteTrace();
    traceHold("field-2", {
      kind: "followUp",
      triggerCandidateId: "field-1",
      batch: true,
    });

    emitWriteTrace(
      items,
      new Set(["field-1", "field-2"]),
      new CandidateRegistry(),
      results,
      results,
    );

    const rows = table.mock.calls[0]![0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      executor: "search",
      heldByBatchHalt: false,
      haltKind: "",
      haltTriggerOrdinal: null,
    });
    expect(rows[1]).toMatchObject({
      writeOrdinal: 2,
      heldByBatchHalt: true,
      haltKind: "followUp",
      haltTriggerOrdinal: 1,
      failureCode: "SEARCH_FOLLOWUP_HALTED",
      code: "STALE_TARGET",
    });
    expect(JSON.stringify(table.mock.calls)).not.toContain(OPTION_TEXT);
  });

  it("emits nothing outside a development build", () => {
    enableDiagnostics(false);
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    beginWriteTrace();
    emitWriteTrace(
      [item("field-1")],
      new Set(["field-1"]),
      new CandidateRegistry(),
      undefined,
      [{ candidateId: "field-1", status: "skipped", reason: "x" }],
    );
    expect(table).not.toHaveBeenCalled();
  });
});
