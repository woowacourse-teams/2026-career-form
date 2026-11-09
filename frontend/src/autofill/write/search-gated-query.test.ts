import { afterEach, describe, expect, it, vi } from "vitest";

import type { InteractionDecisionProvider } from "../api/interaction-types";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "../interaction/readonly-search-executor";

const VALUE = "가상대학교";

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

/**
 * A page-level search layer (no dialog role, title in plain text) whose query
 * input stays disabled until the one region select in the layer is chosen.
 */
function gatedLayer() {
  document.body.innerHTML = `
    <section><h3>학력</h3><div data-repeater-item>
      <label>학교명<input placeholder="학교명" readonly data-target></label>
      <button type="button" aria-label="검색" data-open></button>
    </div></section>
    <section><h3>어학</h3><label>등록번호<input data-unrelated></label></section>
    <div data-app><div id="layer" style="display:none; position:fixed">
      <div><div>학교 검색</div><button type="button" data-close></button></div>
      <select data-region><option value="">지역 선택</option>
        <option value="11">서울특별시</option><option value="41">경기도</option></select>
      <input type="text" placeholder="학교명을 검색하세요" disabled data-query>
      <button type="button" aria-label="검색" disabled data-search></button>
      <ul data-search-results></ul>
      <button type="button" data-direct>직접입력</button>
      <button type="button" disabled>등록</button>
    </div></div>`;
  const layer = document.querySelector<HTMLElement>("#layer")!;
  const target = document.querySelector<HTMLInputElement>("[data-target]")!;
  const region = layer.querySelector<HTMLSelectElement>("[data-region]")!;
  const query = layer.querySelector<HTMLInputElement>("[data-query]")!;
  const search = layer.querySelector<HTMLButtonElement>("[data-search]")!;
  const results = layer.querySelector<HTMLElement>("[data-search-results]")!;
  const direct = vi.fn();
  layer.querySelector("[data-direct]")!.addEventListener("click", direct);
  document.querySelector("[data-open]")!.addEventListener("click", () => {
    layer.style.display = "block";
  });
  layer.querySelector("[data-close]")!.addEventListener("click", () => {
    layer.style.display = "none";
  });
  region.addEventListener("change", () => {
    query.disabled = region.value === "";
  });
  query.addEventListener("input", () => {
    search.disabled = query.value === "";
  });
  search.addEventListener("click", () => {
    results.dataset.searchQuery = query.value;
    results.dataset.searchComplete = "true";
    results.dataset.resultCount = "1";
    results.innerHTML = `<li><button type="button">${VALUE}</button></li>`;
    results.querySelector("button")!.addEventListener("click", () => {
      target.value = VALUE;
      layer.style.display = "none";
    });
  });
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items?.flatMap((item) => item.fields) ?? []),
  ]);
  const targetId = fields.find((field) => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    return (
      (lookup.status === "ready" || lookup.status === "blocked") &&
      lookup.handle.elements[0] === target
    );
  })!.candidateId;
  return {
    layer,
    target,
    region,
    query,
    direct,
    async run(contextValues?: readonly { key: string; value: string }[]) {
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: targetId,
        canonicalFieldKey: "education.university.schoolName",
        expectedValue: VALUE,
        decisionProvider,
        genericPopupRecovery: true,
        ...(contextValues ? { contextValues } : {}),
      });
      await vi.runAllTimersAsync();
      return pending;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("a search layer whose query waits for one select", () => {
  it("chooses the option of the same entry's stored value, then searches", async () => {
    vi.useFakeTimers();
    const test = gatedLayer();
    const result = await test.run([
      { key: "education.university.schoolRegion", value: "region:seoul" },
      { key: "education.university.majorName", value: "가상전공" },
    ]);
    expect(result, JSON.stringify(result)).toMatchObject({
      status: "selected",
    });
    expect(test.region.selectedOptions[0]?.textContent).toBe("서울특별시");
    expect(test.query.value).toBe(VALUE);
    expect(test.target.value).toBe(VALUE);
    expect(test.layer.style.display).toBe("none");
    expect(test.direct).not.toHaveBeenCalled();
  });

  it("chooses nothing when no stored value names an option", async () => {
    vi.useFakeTimers();
    const test = gatedLayer();
    const result = await test.run([
      { key: "education.university.schoolRegion", value: "region:jeju" },
    ]);
    expect(result.status, JSON.stringify(result)).toBe("failed");
    expect(test.region.value).toBe("");
    expect(test.query.value).toBe("");
    expect(test.target.value).toBe("");
    // The layer has no named close control, so the failure reports it open.
    expect(result).toMatchObject({
      reason: "search_query_not_found",
      surfaceLeftOpen: true,
    });
    expect(test.direct).not.toHaveBeenCalled();
  });

  it("chooses nothing when two stored values name different options", async () => {
    vi.useFakeTimers();
    const test = gatedLayer();
    const result = await test.run([
      { key: "education.university.schoolRegion", value: "region:seoul" },
      { key: "education.university.campus", value: "경기도" },
    ]);
    expect(result.status).toBe("failed");
    expect(test.region.value).toBe("");
    expect(test.target.value).toBe("");
    // The layer has no named close control, so the failure reports it open.
    expect(result).toMatchObject({
      reason: "search_query_not_found",
      surfaceLeftOpen: true,
    });
  });
});
