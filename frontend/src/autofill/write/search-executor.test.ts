import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../interaction", () => ({
  executeReadonlySearch: vi.fn(),
}));
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeReadonlySearch } from "../interaction";
import type { ApprovedWriteResult } from "./executor";
import {
  executeApprovedSearchWrites,
  settledSearchSelectionResult,
} from "./search-executor";

function setup(count = 1) {
  document.body.innerHTML = "";
  const registry = new CandidateRegistry();
  const items: ReviewPlanItem[] = [];
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.dataset.repeaterItem = String(i);
    row.innerHTML =
      '<dl><dt>전공</dt><dd><input type="text" readonly><button type="button">전공 검색</button></dd></dl>';
    document.body.append(row);
    const input = row.querySelector("input")!;
    input.value = "가상값";
    const candidateId = `field-${i}`;
    registry.registerField({
      kind: "field",
      candidateId,
      sectionId: "section-1",
      signature: createStructuralSignature([input]),
      elements: [input],
      optionElements: new Map(),
      candidate: {
        candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
        readonly: true,
        semanticContext: { inputType: "text" },
      },
    });
    items.push({
      candidateId,
      fieldLabel: "전공",
      profileEntryId: `entry-${i}`,
      currentValue: "가상값",
      profileValue: "가상값",
      previewValue: "가상값",
      status: "needs-review",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "",
      analysis: {
        candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "education.university.majorName",
        },
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "CONDITIONAL",
        interactionStatus: "READY",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    });
  }
  const approvedCandidateIds = new Set(items.map((item) => item.candidateId));
  const results: ApprovedWriteResult[] = items.map((item) => ({
    candidateId: item.candidateId,
    status: "skipped",
    reason: "pending",
  }));
  return { registry, items, approvedCandidateIds, results };
}

describe("approved search batch boundaries", () => {
  beforeEach(() => {
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "unchanged",
      targetCandidateId: "field-0",
      identity: {} as never,
    });
  });

  afterEach(() => {
    vi.mocked(executeReadonlySearch).mockReset();
    document.body.innerHTML = "";
  });

  it("retains equal values but revalidates their captured group at final settlement", async () => {
    const test = setup();
    await executeApprovedSearchWrites(test);
    expect(test.results[0]).toMatchObject({
      status: "skipped",
      outcome: "unchanged",
    });
    const input = document.querySelector("input")!;
    const dd = document.createElement("dd");
    document.querySelector("dl")!.append(dd);
    dd.append(input);
    expect(
      settledSearchSelectionResult(
        test.items[0]!,
        test.registry,
        test.results[0]!,
      ),
    ).toMatchObject({ status: "skipped", outcome: "needs-verification" });
  });

  it("does not search a later item after an unresolved failed transaction", async () => {
    const test = setup(2);
    test.items[1]!.currentValue = "";
    document.querySelector("button")!.remove();
    await executeApprovedSearchWrites(test);
    expect(test.results.map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
    ]);
    expect(test.results[1]).toMatchObject({ outcome: "needs-verification" });
  });

  it("does not mark equal existing values successful after approval is revoked", async () => {
    const test = setup();
    await executeApprovedSearchWrites({ ...test, assertCurrent: () => false });
    expect(test.results[0]?.status).toBe("skipped");
  });

  it("does not spend the search budget on already equal values", async () => {
    const test = setup(5);
    await executeApprovedSearchWrites(test);
    expect(test.results.map((result) => result.status)).toEqual(
      Array(5).fill("skipped"),
    );
  });

  it("invalidates retained success when the approved profile entry changes", async () => {
    const test = setup();
    await executeApprovedSearchWrites(test);
    test.items[0]!.profileEntryId = "different-entry";
    expect(
      settledSearchSelectionResult(
        test.items[0]!,
        test.registry,
        test.results[0]!,
      ),
    ).toMatchObject({ status: "skipped", outcome: "needs-verification" });
  });

  it("blocks non-DIRECT and static mappings even when an item is manually selected", async () => {
    const test = setup(2);
    test.items[0]!.analysis!.valueBinding = {
      type: "DERIVED",
      recipe: "KOREAN_FULL_NAME",
    };
    test.items[1]!.analysis!.mappingStatus = "ADAPTER_VERIFIED";
    await executeApprovedSearchWrites(test);
    expect(test.results.map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });

  it("continues ordinary writes after a search failure that made no page change", async () => {
    const test = setup(2);
    test.items[0]!.currentValue = "";
    document.querySelector<HTMLInputElement>("input")!.value = "";
    test.items[1]!.analysis!.writePlan = { command: "SET_TEXT" };
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "failed",
      targetCandidateId: "field-0",
      reason: "execution_failed",
      effect: "none",
    });

    const stopped = await executeApprovedSearchWrites({
      ...test,
      writeOrdinary: (item) => ({
        candidateId: item.candidateId,
        status: "written",
      }),
    });

    expect(stopped).toBe(false);
    expect(test.results).toMatchObject([
      { status: "skipped", outcome: "failed", code: "EXECUTION_FAILED" },
      { candidateId: "field-1", status: "written" },
    ]);
  });

  it("stops later ordinary writes after a search changes the page without a confirmed result", async () => {
    const test = setup(2);
    test.items[0]!.currentValue = "";
    document.querySelector<HTMLInputElement>("input")!.value = "";
    test.items[1]!.analysis!.writePlan = { command: "SET_TEXT" };
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "skipped",
      targetCandidateId: "field-0",
      reason: "result_not_reflected",
      effect: "interaction-started",
    });
    const writeOrdinary = vi.fn((item: ReviewPlanItem) => ({
      candidateId: item.candidateId,
      status: "written" as const,
    }));

    const stopped = await executeApprovedSearchWrites({
      ...test,
      writeOrdinary,
    });

    expect(stopped).toBe(true);
    expect(writeOrdinary).not.toHaveBeenCalled();
    expect(test.results).toMatchObject([
      { outcome: "needs-verification", code: "RETAINED_VALUE_UNCONFIRMED" },
      { outcome: "needs-verification", code: "STALE_TARGET" },
    ]);
  });

  it("enforces the search budget before opening a fifth empty readonly lookup", async () => {
    const test = setup(5);
    test.items.forEach((item) => {
      item.currentValue = "";
    });
    document.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.value = "";
    });
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "failed",
      targetCandidateId: "field-0",
      reason: "execution_failed",
      effect: "none",
    });

    await executeApprovedSearchWrites(test);

    expect(executeReadonlySearch).toHaveBeenCalledTimes(4);
    expect(test.results[4]).toMatchObject({
      outcome: "unsupported",
      code: "UNSUPPORTED_CONTROL",
    });
  });

  it("does not retain a selected result without a captured current target identity", () => {
    const test = setup();

    expect(
      settledSearchSelectionResult(test.items[0]!, test.registry, {
        candidateId: "field-0",
        status: "written",
      }),
    ).toMatchObject({
      outcome: "needs-verification",
      code: "RETAINED_VALUE_UNCONFIRMED",
    });
  });
});
