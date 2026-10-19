import { afterEach, describe, expect, it, vi } from "vitest";

import type { InteractionDecisionProvider } from "../api/interaction-types";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "../interaction/readonly-search-executor";
import {
  isQueryInput,
  queryCandidates,
} from "../interaction/readonly-search-popup";
import { queryControls } from "../interaction/search-controls";
import { SearchSession } from "../interaction/search-session";
import { SearchSurface } from "../interaction/search-surface";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWrites } from "./native-executor";
import { executeApprovedSearchWrites } from "./search-executor";
import type { ApprovedWriteResult } from "./write-result";

const VALUE = "가상전공";
const decisionProvider: InteractionDecisionProvider = async (request) => ({
  schemaVersion: 2,
  snapshotId: request.snapshotId,
  status: "COMPLETE",
  mode: "GENERIC",
  decisions: request.decisions.map((decision) => ({
    decisionId: decision.decisionId,
    role: decision.role,
    selection: "SELECTED",
    candidateId: decision.candidates[0]!.candidateId,
  })),
});

function fixture(kind: "table" | "dialog", delayed = false) {
  const content =
    kind === "table"
      ? `<h2>전공 검색</h2><p>항목명을 입력하세요.</p>
         <table><tbody><tr><th><label for="query">검색어</label></th>
         <td><input id="query" style="display:none"></td></tr></tbody></table>
         <button type="button" data-search>검색</button>
         <table data-search-results><tbody></tbody></table>
         <footer><button type="button" data-direct>직접입력</button>
         <button type="button" data-confirm>확인</button></footer>`
      : `<header><h3>전공 조회</h3></header>
         <div><input type="search" aria-label="검색어" style="display:none">
         <button type="button" data-search>조회</button></div>
         <ol data-search-results></ol><aside>
         <input type="button" value="직접입력" data-direct>
         <input type="button" value="확인" data-confirm></aside>`;
  document.body.innerHTML = `
    <section aria-label="학력"><div data-repeater-item>
      <dl><dt>전공</dt><dd><input aria-label="전공" readonly data-target>
      <button type="button" aria-controls="popup" data-open>전공 검색</button></dd>
      <dt>상세</dt><dd><input aria-label="상세" data-dependent></dd></dl>
    </div></section>
    <section aria-label="어학"><label>등록번호<input data-unrelated></label></section>
    ${
      kind === "table"
        ? `<section id="popup" data-search-surface style="display:none">${content}</section>`
        : `<div id="popup" role="dialog" style="display:none">${content}</div>`
    }`;
  const popup = document.querySelector<HTMLElement>("#popup")!;
  const target = document.querySelector<HTMLInputElement>("[data-target]")!;
  const query = popup.querySelector<HTMLInputElement>(
    "input:not([type=button])",
  )!;
  const opener = document.querySelector<HTMLButtonElement>("[data-open]")!;
  const confirm = popup.querySelector<HTMLElement>("[data-confirm]")!;
  const search = popup.querySelector<HTMLButtonElement>("[data-search]")!;
  const results = popup.querySelector<HTMLElement>("[data-search-results]")!;
  const direct = vi.fn();
  popup.querySelector("[data-direct]")!.addEventListener("click", direct);
  const forbidden = vi.fn();
  for (const label of ["저장", "제출", "이동"]) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.addEventListener("click", forbidden);
    popup.append(control);
  }
  opener.addEventListener("click", () => {
    popup.style.display = "block";
    if (!delayed) query.style.display = "block";
  });
  confirm.addEventListener("click", () => {
    popup.style.display = "none";
  });
  let resultMode: "selected" | "empty" | "unreflected" = "selected";
  search.addEventListener("click", () => {
    results.dataset.searchQuery = query.value;
    results.dataset.searchComplete = "true";
    results.dataset.resultCount = resultMode === "empty" ? "0" : "1";
    results.innerHTML =
      resultMode === "empty"
        ? "검색 결과가 없습니다."
        : kind === "table"
          ? `<tbody><tr><td><button type="button">${VALUE}</button></td></tr></tbody>`
          : `<li><button type="button">${VALUE}</button></li>`;
    results.querySelector("button")?.addEventListener("click", () => {
      if (resultMode === "selected") {
        target.value = VALUE;
        popup.style.display = "none";
      }
    });
  });
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items?.flatMap((item) => item.fields) ?? []),
  ]);
  function idFor(element: HTMLInputElement) {
    return fields.find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        (lookup.status === "ready" || lookup.status === "blocked") &&
        lookup.handle.elements[0] === element
      );
    })!.candidateId;
  }
  const targetId = idFor(target);
  const surface = new SearchSurface(
    "same-document-dialog",
    popup,
    popup,
    opener,
    target,
  );
  function item(
    element: HTMLInputElement,
    key: string,
    entry: string,
    search = false,
  ): ReviewPlanItem {
    const candidateId = idFor(element);
    return {
      candidateId,
      fieldLabel: element.getAttribute("aria-label") ?? "등록번호",
      profileEntryId: entry,
      currentValue: "",
      profileValue: VALUE,
      previewValue: VALUE,
      status: "needs-review",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "",
      analysis: {
        candidateId,
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "CONDITIONAL",
        interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey: key },
        writePlan: { command: search ? "SEARCH_SELECTION" : "SET_TEXT" },
      },
    };
  }
  const items = [
    item(target, "education.university.majorName", "education-1", true),
    item(
      document.querySelector("[data-dependent]")!,
      "education.university.additionalMajorName",
      "education-1",
    ),
    item(
      document.querySelector("[data-unrelated]")!,
      "languages.languageTest.registrationNo",
      "language-1",
    ),
  ];
  const approvedCandidateIds = new Set(
    items.map(({ candidateId }) => candidateId),
  );
  return {
    popup,
    target,
    query,
    opener,
    confirm,
    search,
    direct,
    forbidden,
    surface,
    snapshot,
    targetId,
    setMode(mode: typeof resultMode) {
      resultMode = mode;
    },
    async run(genericPopupRecovery = false) {
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: targetId,
        canonicalFieldKey: "education.university.majorName",
        expectedValue: VALUE,
        decisionProvider,
        genericPopupRecovery,
      });
      await vi.runAllTimersAsync();
      return pending;
    },
    async batch(scope?: "row") {
      const results: ApprovedWriteResult[] = items.map(({ candidateId }) => ({
        candidateId,
        status: "skipped",
        reason: "pending",
      }));
      const pending = executeApprovedSearchWrites({
        items,
        registry: snapshot.registry,
        approvedCandidateIds,
        results,
        followUpHaltScope: scope,
        interactionDecisionProvider: decisionProvider,
        writeOrdinary: (item) =>
          executeApprovedWrites({
            items: [item],
            registry: snapshot.registry,
            approvedCandidateIds,
          })[0]!,
      });
      await vi.runAllTimersAsync();
      await pending;
      return results;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe.each(["table", "dialog"] as const)("%s search popup", (kind) => {
  it("reproduces an early visible submit ending collection before the query is shown", async () => {
    vi.useFakeTimers();
    const test = fixture(kind, true);
    expect(queryCandidates(document)).toContain(test.query);
    expect(isQueryInput(test.query)).toBe(false);
    expect(queryControls(test.surface)).toEqual([]);
    const pause = vi.spyOn(SearchSession.prototype, "pause");
    const result = await test.run();
    expect(result).toMatchObject({
      status: "failed",
      reason: "search_query_not_found",
    });
    expect(pause).not.toHaveBeenCalled();
    expect(test.query.value).toBe("");
    test.query.style.display = "block";
    expect(isQueryInput(test.query)).toBe(true);
    expect(queryControls(test.surface)).toEqual([test.query]);
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("recollects the delayed query before selecting a result on the generic route", async () => {
    vi.useFakeTimers();
    const test = fixture(kind, true);
    const pause = SearchSession.prototype.pause;
    vi.spyOn(SearchSession.prototype, "pause").mockImplementation(
      function (this: SearchSession, ms) {
        test.query.style.display = "block";
        return pause.call(this, ms);
      },
    );
    const result = await test.run(true);
    expect(result, JSON.stringify(result)).toMatchObject({
      status: "selected",
    });
    expect(test.query.value).toBe(VALUE);
    expect(test.target.value).toBe(VALUE);
    expect(test.surface.closure()).toBe("closed");
    expect(test.direct).not.toHaveBeenCalled();
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("writes the selected generic search without unsupported controls", async () => {
    vi.useFakeTimers();
    const test = fixture(kind, true);
    const pause = SearchSession.prototype.pause;
    vi.spyOn(SearchSession.prototype, "pause").mockImplementation(
      function (this: SearchSession, ms) {
        test.query.style.display = "block";
        return pause.call(this, ms);
      },
    );
    const results = await test.batch("row");
    expect(
      results.map(({ status }) => status),
      JSON.stringify(results),
    ).toEqual(["written", "written", "written"]);
    expect(
      results.some(
        (result) =>
          result.status === "skipped" && result.code === "UNSUPPORTED_CONTROL",
      ),
    ).toBe(false);
    expect(test.direct).not.toHaveBeenCalled();
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it.each(["readonly", "disabled", "hidden"] as const)(
    "never types into a query that stays %s and keeps the existing wait budget",
    async (mode) => {
      vi.useFakeTimers();
      const test = fixture(kind, mode === "hidden");
      test.query.readOnly = mode === "readonly";
      test.query.disabled = mode === "disabled";
      const started = performance.now();
      const result = await test.run(true);
      expect(result).toMatchObject({ reason: "search_query_not_found" });
      expect(performance.now() - started).toBeLessThanOrEqual(8_000);
      expect(test.query.value).toBe("");
      expect(test.target.value).toBe("");
      expect(test.forbidden).not.toHaveBeenCalled();
    },
  );

  it("rejects multiple live queries without asking the provider to choose one", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    const second = test.query.cloneNode() as HTMLInputElement;
    second.removeAttribute("id");
    second.setAttribute("aria-label", "검색어");
    second.style.display = "block";
    test.query.after(second);
    const result = await test.run(true);
    expect(result).toMatchObject({ reason: "multiple_search_query_inputs" });
    expect(test.query.value).toBe("");
    expect(second.value).toBe("");
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("closes an empty confirmation-only popup and holds only the dependent row", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    test.setMode("empty");
    const result = await test.run(true);
    expect(result).toMatchObject({ reason: "search_results_not_found" });
    expect(result).not.toHaveProperty("surfaceLeftOpen");
    expect(test.surface.closure()).toBe("closed");
    expect(test.target.value).toBe("");
    expect(test.direct).not.toHaveBeenCalled();
    expect(test.forbidden).not.toHaveBeenCalled();

    const batch = fixture(kind);
    batch.setMode("empty");
    const results = await batch.batch("row");
    expect(results[0]).not.toHaveProperty("surfaceLeftOpen");
    expect(results[1]).toMatchObject({ failureCode: "SEARCH_FOLLOWUP_HALTED" });
    expect(results[2]).toMatchObject({ status: "written" });
    expect(batch.surface.closure()).toBe("closed");
    expect(batch.target.value).toBe("");
    expect(batch.direct).not.toHaveBeenCalled();
    expect(batch.forbidden).not.toHaveBeenCalled();
  });

  it("keeps the static default confirmation popup open and holds every later item", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    test.setMode("empty");
    const results = await test.batch();
    expect(results[0]).toMatchObject({
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "no_safe_close_control",
    });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
    ]);
    expect(test.surface.closure()).toBe("open");
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("keeps an unsafe popup open with a reason and holds every later item", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    test.setMode("empty");
    test.confirm.remove();
    const results = await test.batch("row");
    expect(results[0]).toMatchObject({
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "no_safe_close_control",
    });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
    ]);
    expect(test.surface.closure()).toBe("open");
    expect(test.direct).not.toHaveBeenCalled();
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("requires confirmed closure after the click or holds every later item", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    test.setMode("empty");
    const clicked = vi.fn((event: Event) => event.stopImmediatePropagation());
    test.confirm.addEventListener("click", clicked, true);
    const results = await test.batch("row");
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "close_not_confirmed",
    });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
    ]);
    expect(test.surface.closure()).toBe("open");
    expect(test.forbidden).not.toHaveBeenCalled();
  });

  it("never uses confirmation cleanup after result activation", async () => {
    vi.useFakeTimers();
    const test = fixture(kind);
    test.setMode("unreflected");
    const clicked = vi.fn();
    test.confirm.addEventListener("click", clicked);
    const results = await test.batch("row");
    expect(results[0]).toMatchObject({
      surfaceLeftOpen: true,
      surfaceLeftOpenReason: "no_safe_close_control",
    });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
      expect.objectContaining({ failureCode: "SEARCH_FOLLOWUP_HALTED" }),
    ]);
    expect(clicked).not.toHaveBeenCalled();
    expect(test.surface.closure()).toBe("open");
    expect(test.forbidden).not.toHaveBeenCalled();
  });
});
