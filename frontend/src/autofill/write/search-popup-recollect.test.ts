import { afterEach, describe, expect, it, vi } from "vitest";

import type { InteractionDecisionProvider } from "../api/interaction-types";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  executeReadonlySearch,
} from "../interaction/readonly-search-executor";
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
      ? `<h2>전공 검색</h2><p>검색어를 입력한 뒤 항목을 선택하세요.</p>
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
    ${kind === "table"
      ? `<section id="popup" data-search-surface style="display:none">${content}</section>`
      : `<div id="popup" role="dialog" style="display:none">${content}</div>`}`;
  const popup = document.querySelector<HTMLElement>("#popup")!;
  const target = document.querySelector<HTMLInputElement>("[data-target]")!;
  const query = popup.querySelector<HTMLInputElement>("input:not([type=button])")!;
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
        : `<button type="button">${VALUE}</button>`;
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
      return (lookup.status === "ready" || lookup.status === "blocked") &&
        lookup.handle.elements[0] === element;
    })!.candidateId;
  }
  const targetId = idFor(target);
  const surface = new SearchSurface(
    kind === "table" ? "same-document-dialog" : "same-document-dialog",
    popup, popup, opener, target,
  );
  function item(element: HTMLInputElement, key: string, entry: string, search = false): ReviewPlanItem {
    const candidateId = idFor(element);
    return {
      candidateId, fieldLabel: element.getAttribute("aria-label") ?? "등록번호",
      profileEntryId: entry, currentValue: "", profileValue: VALUE,
      previewValue: VALUE, status: "needs-review", selected: true,
      disabled: false, revealed: true, reason: "",
      analysis: {
        candidateId, matchType: "MATCH", mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "CONDITIONAL", interactionStatus: "READY",
        valueBinding: { type: "DIRECT", profileFieldKey: key },
        writePlan: { command: search ? "SEARCH_SELECTION" : "SET_TEXT" },
      },
    };
  }
  const items = [
    item(target, "education.university.majorName", "education-1", true),
    item(document.querySelector("[data-dependent]")!, "education.university.additionalMajorName", "education-1"),
    item(document.querySelector("[data-unrelated]")!, "languages.languageTest.registrationNo", "language-1"),
  ];
  const approvedCandidateIds = new Set(items.map(({ candidateId }) => candidateId));
  return {
    popup, target, query, opener, confirm, search, direct, forbidden, surface,
    snapshot, targetId,
    setMode(mode: typeof resultMode) { resultMode = mode; },
    async run() {
      const pending = executeReadonlySearch({
        document, registry: snapshot.registry, targetCandidateId: targetId,
        canonicalFieldKey: "education.university.majorName", expectedValue: VALUE,
        decisionProvider,
      });
      await vi.runAllTimersAsync();
      return pending;
    },
    async batch(scope?: "row") {
      const results: ApprovedWriteResult[] = items.map(({ candidateId }) => ({
        candidateId, status: "skipped", reason: "pending",
      }));
      const pending = executeApprovedSearchWrites({
        items, registry: snapshot.registry, approvedCandidateIds, results,
        followUpHaltScope: scope, interactionDecisionProvider: decisionProvider,
        writeOrdinary: (item) => executeApprovedWrites({
          items: [item], registry: snapshot.registry, approvedCandidateIds,
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
    expect(result).toMatchObject({ status: "failed", reason: "search_query_not_found" });
    expect(pause).not.toHaveBeenCalled();
    expect(test.query.value).toBe("");
    test.query.style.display = "block";
    expect(isQueryInput(test.query)).toBe(true);
    expect(queryControls(test.surface)).toEqual([test.query]);
    expect(test.forbidden).not.toHaveBeenCalled();
  });
});
