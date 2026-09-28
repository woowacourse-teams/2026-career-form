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
    ).toMatchObject({
      status: "skipped",
      outcome: "needs-verification",
      failureCode: "VALUE_NOT_RETAINED",
    });
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
      failureCode: "VALUE_NOT_RETAINED",
    });
  });
});

describe("approved university major search boundary", () => {
  beforeEach(() => {
    vi.mocked(executeReadonlySearch).mockReset();
  });

  afterEach(() => {
    vi.mocked(executeReadonlySearch).mockReset();
    document.body.innerHTML = "";
  });

  it("continues to the next approved search after a selected major", async () => {
    const test = setup(2);
    test.items.forEach((item) => {
      item.currentValue = "";
      item.profileValue = `합성전공-${item.candidateId}`;
    });
    document.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.value = "";
    });
    vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
      const input =
        document.querySelectorAll<HTMLInputElement>("input")[
          Number(args.targetCandidateId.replace("field-", ""))
        ]!;
      input.value = args.expectedValue;
      return {
        status: "selected",
        targetCandidateId: args.targetCandidateId,
        identity: {} as never,
      };
    });

    const stopped = await executeApprovedSearchWrites(test);

    expect(stopped).toBe(false);
    expect(executeReadonlySearch).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(executeReadonlySearch)
        .mock.calls.map(([args]) => [
          args.targetCandidateId,
          args.canonicalFieldKey,
          args.expectedValue,
        ]),
    ).toEqual([
      ["field-0", "education.university.majorName", "합성전공-field-0"],
      ["field-1", "education.university.majorName", "합성전공-field-1"],
    ]);
    expect(test.results).toMatchObject([
      { candidateId: "field-0", status: "written", outcome: "success" },
      { candidateId: "field-1", status: "written", outcome: "success" },
    ]);
  });

  it("continues to the approved region using the country URL changed by a completed school search", async () => {
    const test = setup(2);
    test.items.forEach((item) => {
      item.currentValue = "";
    });
    const [school, region] =
      document.querySelectorAll<HTMLInputElement>("input");
    school!.value = "";
    region!.value = "";
    test.items[0]!.analysis!.valueBinding!.profileFieldKey =
      "education.university.schoolName";
    test.items[0]!.profileValue = "합성대학교";
    test.items[1]!.analysis!.valueBinding!.profileFieldKey =
      "education.university.schoolRegion";
    test.items[1]!.profileValue = "서울";
    const regionOpener =
      document.querySelectorAll<HTMLButtonElement>("button")[1]!;
    regionOpener.setAttribute(
      "data-iframe-url",
      "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0",
    );
    vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
      if (args.canonicalFieldKey === "education.university.schoolName") {
        school!.value = "합성대학교";
        regionOpener.setAttribute(
          "data-iframe-url",
          "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=KOR",
        );
      } else {
        expect(regionOpener.getAttribute("data-iframe-url")).toContain(
          "country_cd=KOR",
        );
        region!.value = "서울특별시";
      }
      return {
        status: "selected",
        targetCandidateId: args.targetCandidateId,
        identity: {} as never,
      };
    });
    const stopped = await executeApprovedSearchWrites(test);
    expect(stopped).toBe(false);
    expect(
      vi
        .mocked(executeReadonlySearch)
        .mock.calls.map(([args]) => args.canonicalFieldKey),
    ).toEqual([
      "education.university.schoolName",
      "education.university.schoolRegion",
    ]);
    expect(test.results.map((result) => result.status)).toEqual([
      "written",
      "written",
    ]);
  });

  it("halts a later approved region after an interacted school lookup fails without treating the region as searched", async () => {
    const test = setup(2);
    test.items.forEach((item) => {
      item.currentValue = "";
    });
    document.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.value = "";
    });
    test.items[0]!.analysis!.valueBinding!.profileFieldKey =
      "education.university.schoolName";
    test.items[1]!.analysis!.valueBinding!.profileFieldKey =
      "education.university.schoolRegion";
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "failed",
      targetCandidateId: "field-0",
      reason: "popup_unresolved",
      effect: "value-observed",
    });
    const stopped = await executeApprovedSearchWrites(test);
    expect(stopped).toBe(true);
    expect(executeReadonlySearch).toHaveBeenCalledTimes(1);
    expect(test.results).toMatchObject([
      { status: "skipped", outcome: "needs-verification" },
      { status: "skipped", failureCode: "SEARCH_FOLLOWUP_HALTED" },
    ]);
  });

  it("halts the next approved search after interaction-started failure and distinguishes both reasons", async () => {
    const test = setup(2);
    test.items.forEach((item) => {
      item.currentValue = "";
    });
    document.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.value = "";
    });
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "skipped",
      targetCandidateId: "field-0",
      reason: "result_set_incomplete",
      effect: "interaction-started",
    });

    const stopped = await executeApprovedSearchWrites(test);

    expect(stopped).toBe(true);
    expect(executeReadonlySearch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeReadonlySearch).mock.calls[0]![0]).toMatchObject({
      targetCandidateId: "field-0",
      canonicalFieldKey: "education.university.majorName",
    });
    expect(test.results).toMatchObject([
      {
        candidateId: "field-0",
        status: "skipped",
        outcome: "needs-verification",
        failureCode: "SEARCH_RESULTS_INCOMPLETE",
      },
      {
        candidateId: "field-1",
        status: "skipped",
        outcome: "needs-verification",
        failureCode: "SEARCH_FOLLOWUP_HALTED",
      },
    ]);
  });

  it("preserves an unrelated existing field while writing an approved major", async () => {
    const test = setup(2);
    test.items[0]!.currentValue = "";
    test.items[0]!.profileValue = "합성전공";
    test.items[1]!.currentValue = "기존 학과";
    test.items[1]!.profileValue = "다른 학과";
    const [major, unrelated] =
      document.querySelectorAll<HTMLInputElement>("input");
    major!.value = "";
    unrelated!.value = "기존 학과";
    test.approvedCandidateIds.delete("field-1");
    vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
      major!.value = args.expectedValue;
      return {
        status: "selected",
        targetCandidateId: args.targetCandidateId,
        identity: {} as never,
      };
    });

    const stopped = await executeApprovedSearchWrites(test);

    expect(stopped).toBe(false);
    expect(executeReadonlySearch).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(executeReadonlySearch).mock.calls[0]![0].targetCandidateId,
    ).toBe("field-0");
    expect(test.results[0]).toMatchObject({
      status: "written",
      outcome: "success",
    });
    expect(test.results[1]).toMatchObject({
      candidateId: "field-1",
      status: "skipped",
      reason: "pending",
    });
    expect(unrelated!.value).toBe("기존 학과");
  });

  it("does not replace a label-only existing school with a different approved school", async () => {
    const test = setup();
    test.items[0]!.analysis!.valueBinding = {
      type: "DIRECT",
      profileFieldKey: "education.university.schoolName",
    };
    test.items[0]!.currentValue = "기존 학교";
    test.items[0]!.profileValue = "다른 학교";
    const school = document.querySelector<HTMLInputElement>("input")!;
    school.value = "기존 학교";

    const stopped = await executeApprovedSearchWrites(test);

    expect(stopped).toBe(false);
    expect(executeReadonlySearch).not.toHaveBeenCalled();
    expect(test.results[0]).toMatchObject({
      candidateId: "field-0",
      status: "skipped",
      outcome: "needs-verification",
      code: "CONFLICT",
    });
    expect(school.value).toBe("기존 학교");
  });
});

describe("search failure diagnostics", () => {
  it.each([
    ["unverified_search_form", "SEARCH_FORM_UNVERIFIED"],
    ["search_submit_not_found", "SEARCH_FORM_UNVERIFIED"],
    ["surface_navigation_unsafe", "SEARCH_NAVIGATION_UNSAFE"],
    ["result_set_incomplete", "SEARCH_RESULTS_INCOMPLETE"],
    ["result_activation_unsafe", "SEARCH_ACTIVATION_UNSAFE"],
    ["result_pending", "SEARCH_TIMEOUT"],
    ["deadline_exceeded", "SEARCH_TIMEOUT"],
    ["multiple_matching_results", "SEARCH_AMBIGUOUS"],
    ["search_results_not_found", "SEARCH_NO_EXACT_MATCH"],
    ["selection_effect_unverified", "SEARCH_ACTIVATION_UNSAFE"],
    ["selection_postcondition_failed", "SEARCH_UNCONFIRMED"],
  ] as const)(
    "delivers %s as %s through the approved result",
    async (reason, failureCode) => {
      const test = setup();
      test.items[0]!.currentValue = "";
      document.querySelector<HTMLInputElement>("input")!.value = "";
      vi.mocked(executeReadonlySearch).mockResolvedValue({
        status: "skipped",
        targetCandidateId: "field-0",
        reason,
        effect: "none",
      });
      const stopped = await executeApprovedSearchWrites(test);
      expect(stopped).toBe(false);
      expect(test.results[0]).toMatchObject({ status: "skipped", failureCode });
    },
  );

  it("distinguishes the failed search from later halted approved writes", async () => {
    const test = setup(3);
    test.items[0]!.currentValue = "";
    document.querySelector<HTMLInputElement>("input")!.value = "";
    test.items[1]!.analysis!.writePlan = { command: "SET_TEXT" };
    test.approvedCandidateIds.delete("field-2");
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "skipped",
      targetCandidateId: "field-0",
      reason: "result_activation_unsafe",
      effect: "interaction-started",
    });
    const writeOrdinary = vi.fn(
      (item: ReviewPlanItem): ApprovedWriteResult => ({
        candidateId: item.candidateId,
        status: "written",
      }),
    );
    const stopped = await executeApprovedSearchWrites({
      ...test,
      writeOrdinary,
    });
    expect(stopped).toBe(true);
    expect(writeOrdinary).not.toHaveBeenCalled();
    expect(test.results[0]).toMatchObject({
      failureCode: "SEARCH_ACTIVATION_UNSAFE",
    });
    expect(test.results[1]).toMatchObject({
      failureCode: "SEARCH_FOLLOWUP_HALTED",
    });
    expect(test.results[2]).not.toHaveProperty(
      "failureCode",
      "SEARCH_FOLLOWUP_HALTED",
    );
  });
});

describe("safe continuation after a search rejection", () => {
  beforeEach(() => {
    vi.mocked(executeReadonlySearch).mockReset();
  });
  it("passes only the reviewed local search forms and invalidates altered provenance", async () => {
    const test = setup();
    const item = test.items[0]!;
    item.currentValue = "";
    item.profileValue = "합성자격기사";
    item.analysis!.valueBinding!.profileFieldKey =
      "certifications.certificate.name";
    item.searchValuePlan = {
      profileEntryId: item.profileEntryId!,
      originalName: item.profileValue,
      grade: "기사",
      forms: [
        { kind: "original-exact", name: item.profileValue },
        { kind: "name-and-grade", name: "합성자격", grade: "기사" },
      ],
    };
    document.querySelector<HTMLInputElement>("input")!.value = "";
    vi.mocked(executeReadonlySearch).mockImplementation(async (args) => {
      expect(args.searchValues).toEqual(["합성자격기사", "합성자격"]);
      expect(args.assertCurrent?.()).toBe(true);
      item.searchValuePlan = { ...item.searchValuePlan!, grade: "변경" };
      expect(args.assertCurrent?.()).toBe(false);
      return {
        status: "skipped",
        reason: "stale_target",
        targetCandidateId: item.candidateId,
        effect: "none",
      };
    });
    await executeApprovedSearchWrites(test);
    expect(executeReadonlySearch).toHaveBeenCalledTimes(1);
  });

  it("halts the approved batch for a fresh review after verified follow-up options change", async () => {
    const test = setup(2);
    test.items[0]!.currentValue = "";
    document.querySelector<HTMLInputElement>("input")!.value = "";
    test.items[1]!.analysis!.writePlan = { command: "SET_TEXT" };
    const select = document.createElement("select");
    const onSearchFollowUp = vi.fn();
    const writeOrdinary = vi.fn();
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "selected",
      targetCandidateId: "field-0",
      identity: {} as never,
      followUp: { controls: [select] },
    });
    const stopped = await executeApprovedSearchWrites({
      ...test,
      writeOrdinary,
      onSearchFollowUp,
    });
    expect(stopped).toBe(true);
    expect(onSearchFollowUp).toHaveBeenCalledWith(test.items[0], [select]);
    expect(writeOrdinary).not.toHaveBeenCalled();
    expect(test.results[0]).toMatchObject({ status: "written" });
    expect(test.results[1]).toMatchObject({
      status: "skipped",
      outcome: "needs-verification",
    });
  });

  it("executes a later approved operation when the rejected search had no effect", async () => {
    const test = setup(3);
    test.items[0]!.currentValue = "";
    document.querySelector<HTMLInputElement>("input")!.value = "";
    test.items[1]!.analysis!.writePlan = { command: "SET_TEXT" };
    test.approvedCandidateIds.delete("field-2");
    vi.mocked(executeReadonlySearch).mockResolvedValue({
      status: "skipped",
      targetCandidateId: "field-0",
      reason: "unverified_search_form",
      effect: "none",
    });
    const writeOrdinary = vi.fn(
      (item: ReviewPlanItem): ApprovedWriteResult => ({
        candidateId: item.candidateId,
        status: "written",
      }),
    );
    const stopped = await executeApprovedSearchWrites({
      ...test,
      writeOrdinary,
    });
    expect(stopped).toBe(false);
    expect(writeOrdinary).toHaveBeenCalledTimes(1);
    expect(writeOrdinary).toHaveBeenCalledWith(test.items[1]);
    expect(test.results[0]).toMatchObject({
      failureCode: "SEARCH_FORM_UNVERIFIED",
    });
    expect(test.results[1]).toMatchObject({ status: "written" });
    expect(test.results[2]).not.toHaveProperty(
      "failureCode",
      "SEARCH_FOLLOWUP_HALTED",
    );
  });
});
