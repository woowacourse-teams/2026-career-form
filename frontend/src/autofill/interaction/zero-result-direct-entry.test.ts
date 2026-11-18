import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ApprovedCatalogMatch } from "../profile/catalog-match";
import { executeReadonlySearch } from "./readonly-search-executor";

const VALUE = "테스트자격증";

type LayerOptions = {
  /** Result markup the page renders into the list after a search. */
  results?: string;
  /** The page keeps the query input and never reflects the search. */
  commit?: boolean;
  twoDirect?: boolean;
  twoConfirm?: boolean;
  /** Ordered search values; the first equals the expected value. */
  searchValues?: readonly string[];
  /** A visible zero-result notice beside the list. */
  notice?: boolean;
  /** Mark the confirmation as new after the direct input opens. */
  catalogMatch?: ApprovedCatalogMatch;
};

/**
 * A role-less same-document layer whose zero-result answer is an unchanged,
 * empty list. Its only text is a notice shown before searching, holding the
 * direct-entry button, and its confirmation exists from the start but stays
 * disabled until the direct input has a value.
 */
async function zeroResultLayer(options: LayerOptions = {}) {
  document.body.innerHTML = `
    <section><h3>자격</h3>
      <div class="row" data-repeater-item>
        <div class="cell"><input id="licenseName" type="text" placeholder="자격증명" readonly>
        <button type="button" class="btn-search-layer"><svg></svg></button></div>
        <input type="text" placeholder="발행처">
        <button type="button">저장</button>
      </div>
    </section>
    <div class="modal-layer" style="display:none; position:fixed">
      <div class="modal-content">
        <div class="modal-search">
          <div class="title">자격증검색</div>
          <div class="desc">자격증명을 2자 이상 입력해주세요.</div>
          <div class="search-form">
            <div class="input-search">
              <label class="invisible" for="searchLicenseName">자격증검색</label>
              <input id="searchLicenseName" type="text" placeholder="검색어를 입력하세요">
              <button type="button" class="btn-search-layer" aria-label="검색"><svg></svg></button>
            </div>
          </div>
          <div class="search-box">
            <ul class="search-list"></ul>
            ${options.notice ? "<p>검색 결과가 없습니다.</p>" : ""}
            <div data-entry-host>
              <div class="search-empty">찾으시는 결과가 없나요?
                <button type="button" data-direct>직접입력</button>
                ${options.twoDirect ? '<button type="button" data-direct>직접입력</button>' : ""}
              </div>
            </div>
          </div>
          <div class="wrap-btn">
            <button type="button" class="btn-primary" data-confirm>등록</button>
            ${options.twoConfirm ? '<button type="button" class="btn-primary" data-confirm>확인</button>' : ""}
          </div>
        </div>
      </div>
      <button type="button" class="btn-close"></button>
    </div>`;
  const layer = document.querySelector<HTMLElement>(".modal-layer")!;
  const target = document.querySelector<HTMLInputElement>("#licenseName")!;
  const opener = document.querySelector<HTMLElement>(
    ".cell > .btn-search-layer",
  )!;
  const query = layer.querySelector<HTMLInputElement>("#searchLicenseName")!;
  const search = layer.querySelector<HTMLButtonElement>(
    ".input-search > .btn-search-layer",
  )!;
  const list = layer.querySelector<HTMLElement>("ul.search-list")!;
  const host = layer.querySelector<HTMLElement>("[data-entry-host]")!;
  const confirms = Array.from(
    layer.querySelectorAll<HTMLButtonElement>("[data-confirm]"),
  );
  const actions = { search: 0, direct: 0, confirm: 0 };
  let manual: HTMLInputElement | undefined;
  opener.addEventListener("click", () => {
    layer.style.display = "block";
  });
  search.addEventListener("click", () => {
    actions.search++;
    if (options.results !== undefined) list.innerHTML = options.results;
    if (options.commit === false) return;
    const reflected = document.createElement("div");
    reflected.className = "input-result";
    reflected.innerHTML = `<span class="text">${query.value}<button type="button" class="btn-clear"></button></span>`;
    query.replaceWith(reflected);
  });
  layer.querySelectorAll("[data-direct]").forEach((direct) =>
    direct.addEventListener("click", () => {
      actions.direct++;
      if (manual) return;
      const form = document.createElement("div");
      form.className = "search-form";
      form.innerHTML = `<div class="input-search"><div class="form-input form-full"><label class="invisible" for="searchInputLicenseName">자격증 입력</label><input id="searchInputLicenseName" type="text" placeholder="직접 입력하세요"></div></div>`;
      host.append(form);
      manual = form.querySelector("input")!;
      confirms.forEach((button) => (button.disabled = true));
      manual.addEventListener("input", () =>
        confirms.forEach((button) => (button.disabled = manual!.value === "")),
      );
    }),
  );
  confirms.forEach((button) =>
    button.addEventListener("click", () => {
      actions.confirm++;
      target.value = manual?.value ?? "";
      layer.style.display = "none";
    }),
  );
  // The confirmation exists from the start and is disabled until a value exists.
  confirms.forEach((button) => (button.disabled = true));
  const snapshot = collectFieldsSnapshot(document);
  const targetId = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        (lookup.status === "ready" || lookup.status === "blocked") &&
        lookup.handle.elements[0] === target
      );
    })!.candidateId;
  const pending = executeReadonlySearch({
    document,
    registry: snapshot.registry,
    targetCandidateId: targetId,
    canonicalFieldKey: "certifications.certificate.name",
    expectedValue: VALUE,
    expectedCurrentValue: "",
    ...(options.catalogMatch ? { catalogMatch: options.catalogMatch } : {}),
    ...(options.searchValues ? { searchValues: options.searchValues } : {}),
    decisionProvider: async (request) => ({
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
    }),
    genericPopupRecovery: true,
  });
  // Time itself is tested: the zero-result answer settles after a bounded wait.
  await vi.runAllTimersAsync();
  return { result: await pending, target, actions };
}

describe("generic zero-result layer answered by direct entry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("writes a manually typed profile value through direct entry", async () => {
    const qa = await zeroResultLayer();
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("still writes a catalog-approved value through direct entry", async () => {
    const qa = await zeroResultLayer({
      catalogMatch: {
        kind: "certificate",
        query: VALUE,
        labels: [VALUE],
      },
    });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("writes through direct entry when the page replaced the query before a second attempt", async () => {
    const qa = await zeroResultLayer({ searchValues: [VALUE, "테스트자격"] });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("runs the second attempt before direct entry while the query stays connected", async () => {
    // An approved catalog value searches its query, then its plain alias.
    const qa = await zeroResultLayer({
      commit: false,
      notice: true,
      catalogMatch: {
        kind: "certificate",
        query: VALUE,
        labels: [VALUE, "테스트자격"],
      },
    });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 2, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("does not write when two direct-entry buttons are offered", async () => {
    const qa = await zeroResultLayer({ twoDirect: true });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("does not write when two confirmation buttons match", async () => {
    const qa = await zeroResultLayer({ twoConfirm: true });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("does not use direct entry when the list gets a result", async () => {
    const qa = await zeroResultLayer({
      results: '<li><a href="javascript:;">다른자격증</a></li>',
    });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("does not treat an unreflected query as zero results", async () => {
    const qa = await zeroResultLayer({ commit: false });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.target.value).toBe("");
  });
});
