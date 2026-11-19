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
  /** The direct-entry button reveals no new input. */
  directRevealsNothing?: boolean;
  /** Run the legacy route instead of generic popup recovery. */
  legacy?: boolean;
  /**
   * The direct input exists from the start inside a hidden wrapper that the
   * direct-entry button only reveals; the zero notice appears after the search
   * and the confirmation is enabled from the start.
   */
  hiddenEntry?: boolean;
  /** Ordered search values; the first equals the expected value. */
  searchValues?: readonly string[];
  /** A visible zero-result notice beside the list. */
  notice?: boolean;
  /** Results rendered for the query typed into the search input. */
  resultsFor?: (query: string) => string;
  /** Expected profile value; defaults to VALUE. */
  expected?: string;
  /** Canonical profile field key; defaults to the certificate name. */
  key?: string;
  /** Profile grade of a catalog-approved certificate. */
  catalogGrade?: string;
  /** Grade-appended exact label also accepted on the name search. */
  gradeAppendedValue?: string;
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
            <p data-late-notice style="display:none">${options.hiddenEntry ? "조회된 결과가 없습니다." : ""}</p>
            <div data-entry-host>
              ${options.hiddenEntry ? '<div data-hidden-entry style="display:none"><input id="searchInputLicenseName" type="text" placeholder="직접 입력하세요"></div>' : ""}
              <div class="search-empty">찾으시는 결과가 없나요?
                <button type="button" data-direct>직접입력</button>
                ${options.twoDirect ? '<button type="button" data-direct>직접입력</button>' : ""}
              </div>
            </div>
          </div>
          <div class="wrap-btn">
            <button type="button" class="btn-primary" data-confirm>${options.hiddenEntry ? "확인" : "등록"}</button>
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
  const hiddenEntry = layer.querySelector<HTMLElement>("[data-hidden-entry]");
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
    if (hiddenEntry)
      layer.querySelector<HTMLElement>("[data-late-notice]")!.style.display =
        "block";
    if (options.resultsFor) list.innerHTML = options.resultsFor(query.value);
    else if (options.results !== undefined) list.innerHTML = options.results;
    if (options.commit === false) return;
    const reflected = document.createElement("div");
    reflected.className = "input-result";
    reflected.innerHTML = `<span class="text">${query.value}<button type="button" class="btn-clear"></button></span>`;
    query.replaceWith(reflected);
  });
  list.addEventListener("click", (event) => {
    const link = (event.target as Element).closest("a");
    if (!link) return;
    event.preventDefault();
    target.value = link.textContent ?? "";
    layer.style.display = "none";
  });
  layer.querySelectorAll("[data-direct]").forEach((direct) =>
    direct.addEventListener("click", () => {
      actions.direct++;
      if (manual || options.directRevealsNothing) return;
      if (hiddenEntry) {
        hiddenEntry.style.display = "block";
        manual = hiddenEntry.querySelector("input")!;
        return;
      }
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
  if (!hiddenEntry) confirms.forEach((button) => (button.disabled = true));
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
    canonicalFieldKey: options.key ?? "certifications.certificate.name",
    expectedValue: options.expected ?? VALUE,
    expectedCurrentValue: "",
    ...(options.catalogMatch ? { catalogMatch: options.catalogMatch } : {}),
    ...(options.searchValues ? { searchValues: options.searchValues } : {}),
    ...(options.catalogGrade ? { catalogGrade: options.catalogGrade } : {}),
    ...(options.gradeAppendedValue
      ? { gradeAppendedValue: options.gradeAppendedValue }
      : {}),
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
    genericPopupRecovery: !options.legacy,
  });
  // Time itself is tested: the zero-result answer settles after a bounded wait.
  await vi.runAllTimersAsync();
  return { result: await pending, target, actions, layer };
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

  describe("grade-appended name", () => {
    const NAME = "테스트자격";
    const WITH_GRADE = "테스트자격 1급";
    const row = (label: string) =>
      `<li><a href="javascript:;">${label}</a></li>`;
    const grade = (value: string) => ({
      expected: NAME,
      searchValues: [NAME, `${NAME} ${value}`],
      gradeAppendedValue: `${NAME} ${value}`,
    });

    it("selects the exact grade-appended result among grade variants", async () => {
      const qa = await zeroResultLayer({
        ...grade("1급"),
        results: row("테스트자격 1급") + row("테스트자격 2급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.target.value).toBe(WITH_GRADE);
      expect(qa.actions.direct).toBe(0);
    });

    it("leaves the field for review when no variant has the profile grade", async () => {
      const qa = await zeroResultLayer({
        ...grade("3급"),
        results: row("테스트자격 1급") + row("테스트자격 2급"),
      });
      expect(qa.result).toMatchObject({
        status: "failed",
        reason: "search_results_not_found",
      });
      expect(qa.actions.direct).toBe(0);
      expect(qa.target.value).toBe("");
    });

    it("prefers the grade-appended result over the plain name result", async () => {
      const qa = await zeroResultLayer({
        ...grade("1급"),
        results: row("테스트자격") + row("테스트자격 1급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.target.value).toBe(WITH_GRADE);
    });

    it("keeps two identical grade-appended results ambiguous", async () => {
      const qa = await zeroResultLayer({
        ...grade("1급"),
        results: row("테스트자격 1급") + row("테스트자격 1급"),
      });
      expect(qa.result.status).not.toBe("selected");
      expect(qa.target.value).toBe("");
    });

    it("runs the grade-appended second attempt while the query stays connected", async () => {
      const qa = await zeroResultLayer({
        ...grade("1급"),
        commit: false,
        resultsFor: (query) =>
          query === WITH_GRADE ? row("테스트자격 1급") : row("테스트자격 2급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.actions.search).toBe(2);
      expect(qa.target.value).toBe(WITH_GRADE);
    });

    it("still writes the original profile name through direct entry on zero results", async () => {
      const qa = await zeroResultLayer(grade("1급"));
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
      expect(qa.target.value).toBe(NAME);
    });
  });

  describe("catalog-approved grade-appended name", () => {
    const NAME = "테스트자격";
    const row = (label: string) =>
      `<li><a href="javascript:;">${label}</a></li>`;
    const approved = (grade?: string) => ({
      expected: NAME,
      catalogMatch: {
        kind: "certificate" as const,
        query: NAME,
        labels: [NAME],
      },
      ...(grade ? { catalogGrade: grade } : {}),
    });

    it("selects the exact grade-appended result among grade variants", async () => {
      const qa = await zeroResultLayer({
        ...approved("1급"),
        results: row("테스트자격 1급") + row("테스트자격 2급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
        selectedValue: "테스트자격 1급",
        catalogSelection: { evidence: { label: "테스트자격 1급" } },
      });
      expect(qa.target.value).toBe("테스트자격 1급");
      expect(qa.actions.direct).toBe(0);
    });

    it("prefers the grade-appended result over the plain label result", async () => {
      const qa = await zeroResultLayer({
        ...approved("1급"),
        results: row("테스트자격") + row("테스트자격 1급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.target.value).toBe("테스트자격 1급");
    });

    it("leaves the field for review when no variant has the profile grade", async () => {
      const qa = await zeroResultLayer({
        ...approved("3급"),
        results: row("테스트자격 1급") + row("테스트자격 2급"),
      });
      expect(qa.result).toMatchObject({
        status: "failed",
        reason: "search_results_not_found",
      });
      expect(qa.actions.direct).toBe(0);
      expect(qa.target.value).toBe("");
    });

    it("does not accept graded variants when the profile has no grade", async () => {
      const qa = await zeroResultLayer({
        ...approved(),
        results: row("테스트자격 1급") + row("테스트자격 2급"),
      });
      expect(qa.result).toMatchObject({
        status: "failed",
        reason: "search_results_not_found",
      });
      expect(qa.target.value).toBe("");
    });

    it("still selects the plain approved label when the profile has no grade", async () => {
      const qa = await zeroResultLayer({
        ...approved(),
        results: row("테스트자격") + row("테스트자격 1급"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.target.value).toBe(NAME);
    });
  });

  describe("accepted values without planned search values", () => {
    const row = (label: string) =>
      `<li><a href="javascript:;">${label}</a></li>`;

    it("accepts every accepted value of the field, not only the typed query", async () => {
      // The query is the first accepted value ("서울"); the site lists only
      // the second one ("서울특별시").
      const qa = await zeroResultLayer({
        key: "education.university.schoolRegion",
        expected: "서울",
        results: row("서울특별시"),
      });
      expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
        status: "selected",
      });
      expect(qa.target.value).toBe("서울특별시");
    });
  });
});

describe("generic layer whose zero results are announced by a visible notice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("writes a manually typed profile value through direct entry", async () => {
    const qa = await zeroResultLayer({ notice: true });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("still writes a catalog-approved value through direct entry", async () => {
    const qa = await zeroResultLayer({
      notice: true,
      catalogMatch: { kind: "certificate", query: VALUE, labels: [VALUE] },
    });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
  });

  it("does not use direct entry when the list has results without an exact match", async () => {
    const qa = await zeroResultLayer({
      results: '<li><a href="javascript:;">다른자격증</a></li>',
    });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("does not write when two direct-entry buttons are offered", async () => {
    const qa = await zeroResultLayer({ notice: true, twoDirect: true });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
  });

  it("does not write when the direct-entry button reveals no new input", async () => {
    const qa = await zeroResultLayer({
      notice: true,
      directRevealsNothing: true,
    });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "failed",
      reason: "unverified_search_form",
      surfaceLeftOpen: true,
    });
    expect(qa.actions.direct).toBe(1);
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
    expect(qa.layer.style.display).toBe("block");
  });

  it("writes a manually typed value through a hidden direct input that the button reveals", async () => {
    const qa = await zeroResultLayer({ hiddenEntry: true });
    expect(qa.result, JSON.stringify(qa.result)).toMatchObject({
      status: "selected",
    });
    expect(qa.actions).toEqual({ search: 1, direct: 1, confirm: 1 });
    expect(qa.target.value).toBe(VALUE);
    expect(qa.layer.style.display).toBe("none");
  });

  it("does not use direct entry on the legacy route", async () => {
    const qa = await zeroResultLayer({ notice: true, legacy: true });
    expect(qa.result.status).not.toBe("selected");
    expect(qa.actions.direct).toBe(0);
    expect(qa.actions.confirm).toBe(0);
    expect(qa.target.value).toBe("");
  });
});
