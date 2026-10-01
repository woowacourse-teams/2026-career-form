import { describe, expect, it } from "vitest";
import {
  hasMultipleEditableControls,
  hasSafeSearchDestination,
  isQueryInput,
  isSearchSubmit,
  isolatedSearchForm,
  normalized,
  resultCandidates,
  safeResultActivation,
  setNativeValue,
} from "./readonly-search-popup";

function renderPopup({
  label = "전공 입력",
  queryType = "text",
  queryValue = "",
  extraQuery = false,
  submitCount = 1,
  action = "",
  target = "",
  includeReset = false,
}: {
  label?: string;
  queryType?: string;
  queryValue?: string;
  extraQuery?: boolean;
  submitCount?: number;
  action?: string;
  target?: string;
  includeReset?: boolean;
} = {}): {
  form: HTMLFormElement;
  query: HTMLInputElement;
  submits: HTMLButtonElement[];
} {
  document.body.innerHTML = `
    <form id="popup-search" action="${action}" target="${target}">
      <label for="query">${label}</label>
      <input id="query" name="query" type="${queryType}" title="${label}" value="${queryValue}" />
      ${extraQuery ? `<input id="query-2" name="query-2" type="text" aria-label="${label}" />` : ""}
      ${Array.from({ length: submitCount }, (_, index) => `<button type="button" data-submit="${index + 1}" aria-label="검색">검색</button>`).join("")}
      ${includeReset ? `<button type="reset" aria-label="초기화">초기화</button>` : ""}
    </form>`;
  return {
    form: document.querySelector<HTMLFormElement>("#popup-search")!,
    query: document.querySelector<HTMLInputElement>("#query")!,
    submits: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-submit]"),
    ),
  };
}

describe("readonly search popup controls", () => {
  it.each([
    ["학교명", "학교명 입력"],
    ["학교소재지", "학교소재지 입력"],
    ["전공", "전공 입력"],
    ["고등학교 학교명", "고등학교 학교명 입력"],
  ])("recognizes %s query input by semantic label", (_name, label) => {
    const { query } = renderPopup({ label });
    expect(isQueryInput(query)).toBe(true);
  });

  it("requires an editable native text or search input for the query", () => {
    const { query } = renderPopup({ queryType: "text" });
    expect(isQueryInput(query)).toBe(true);
    query.readOnly = true;
    expect(isQueryInput(query)).toBe(false);
    query.readOnly = false;
    query.disabled = true;
    expect(isQueryInput(query)).toBe(false);

    const { query: dateQuery } = renderPopup({ queryType: "date" });
    dateQuery.setAttribute("aria-label", "전공 입력");
    expect(isQueryInput(dateQuery)).toBe(false);
  });

  it("recognizes only generic search actions and excludes reset/submit hazards", () => {
    const { submits, form } = renderPopup({ submitCount: 1 });
    expect(isSearchSubmit(submits[0]!)).toBe(true);
    const reset = document.createElement("button");
    reset.type = "reset";
    reset.textContent = "검색";
    form.append(reset);
    expect(isSearchSubmit(reset)).toBe(false);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "검색";
    form.append(submit);
    expect(isSearchSubmit(submit)).toBe(true);
    expect(hasSafeSearchDestination(form.querySelector("input")!, submit)).toBe(
      false,
    );
  });

  it("requires a unique query and search action in one isolated form", () => {
    const unique = renderPopup();
    expect(hasMultipleEditableControls(unique.query)).toBe(false);
    expect(isolatedSearchForm(unique.query, unique.submits[0]!)).toBe(true);

    const duplicateQuery = renderPopup({ extraQuery: true });
    expect(hasMultipleEditableControls(duplicateQuery.query)).toBe(true);
    expect(
      isolatedSearchForm(duplicateQuery.query, duplicateQuery.submits[0]!),
    ).toBe(false);

    const duplicateSubmit = renderPopup({ submitCount: 2 });
    expect(duplicateSubmit.submits).toHaveLength(2);
    expect(
      isolatedSearchForm(duplicateSubmit.query, duplicateSubmit.submits[0]!),
    ).toBe(false);
  });

  it("rejects a form that includes reset/application controls", () => {
    const { query, submits } = renderPopup({ includeReset: true });
    expect(isolatedSearchForm(query, submits[0]!)).toBe(false);
  });

  it("rejects internal navigation and application anchors in the search form", () => {
    const { query, submits, form } = renderPopup();
    const save = document.createElement("a");
    save.href = "/application/save";
    save.textContent = "저장";
    form.append(save);
    expect(isolatedSearchForm(query, submits[0]!)).toBe(false);
  });

  it.each([
    ["top target", { target: "_top" }],
    ["parent target", { target: "_parent" }],
    ["new window target", { target: "popup" }],
    ["application destination", { action: "/application/submit" }],
    ["opaque non-search destination", { action: "/other#results" }],
  ] as const)("rejects %s destination", (_name, options) => {
    const { query, submits } = renderPopup(options);
    expect(hasSafeSearchDestination(query, submits[0]!)).toBe(false);
  });

  it("accepts a same-document search destination without granting application submit", () => {
    const { query, submits } = renderPopup({
      action: "#results",
      target: "_self",
    });
    expect(hasSafeSearchDestination(query, submits[0]!)).toBe(true);
    expect(isolatedSearchForm(query, submits[0]!)).toBe(true);
  });

  it("accepts an explicit same-origin search-only destination for a native GET submit", () => {
    const { query, submits } = renderPopup({ action: "/search#results" });
    submits[0]!.type = "submit";
    expect(hasSafeSearchDestination(query, submits[0]!)).toBe(true);
  });

  it("supports form-associated external controls only when the form stays isolated", () => {
    const { query, submits, form } = renderPopup();
    const external = document.createElement("button");
    external.type = "button";
    external.setAttribute("form", form.id);
    external.textContent = "검색";
    document.body.append(external);
    expect(isSearchSubmit(external)).toBe(true);
    expect(isolatedSearchForm(query, submits[0]!)).toBe(false);

    const externalReset = document.createElement("button");
    externalReset.type = "reset";
    externalReset.setAttribute("form", form.id);
    externalReset.textContent = "초기화";
    document.body.append(externalReset);
    expect(isolatedSearchForm(query, submits[0]!)).toBe(false);
  });
});

describe("readonly search popup query mutation", () => {
  it("uses the native setter only for the popup query and emits input/change", () => {
    const { query } = renderPopup({ label: "학교소재지 입력" });
    const events: string[] = [];
    query.addEventListener("input", () => events.push("input"));
    query.addEventListener("change", () => events.push("change"));
    expect(setNativeValue(query, "가상지역")).toBe(true);
    expect(query.value).toBe("가상지역");
    expect(events).toEqual(["input", "change"]);
  });

  it("stops between popup events when the approval or identity guard changes", () => {
    const { query } = renderPopup({ label: "전공 입력" });
    const events: string[] = [];
    let approved = true;
    query.addEventListener("input", () => {
      events.push("input");
      approved = false;
    });
    query.addEventListener("change", () => events.push("change"));
    expect(setNativeValue(query, "가상전공학과", () => approved)).toBe(false);
    expect(events).toEqual(["input"]);
    expect(query.value).toBe("가상전공학과");
  });

  it("preserves a different existing query as a conflict", () => {
    const { query } = renderPopup({ queryValue: "이미 입력된 검색어" });
    expect(normalized(query.value)).not.toBe(normalized("가상전공학과"));
    expect(query.value).toBe("이미 입력된 검색어");
  });

  it("uses one conservative comparator for Unicode and nonsemantic whitespace", () => {
    expect(normalized("가상  대학교")).toBe(normalized("가상 대학교"));
    expect(normalized("ＡＢＣ")).toBe("ABC");
    expect(normalized("서울")).not.toBe(normalized("서울특별시"));
    expect(normalized("경영학과")).not.toBe(normalized("경영학"));
  });
});

describe("readonly search result safety", () => {
  it("counts duplicate result controls instead of deduplicating their displayed text", () => {
    const { query, form } = renderPopup({ label: "전공 입력" });
    const scope = document.createElement("ul");
    scope.dataset.searchResults = "true";
    const first = document.createElement("button");
    first.type = "button";
    first.textContent = "가상전공학과";
    const second = first.cloneNode(true) as HTMLButtonElement;
    scope.append(first, second);
    form.append(scope);
    expect(resultCandidates(document, "가상전공학과")).toHaveLength(2);
    expect(query).toBeTruthy();
  });

  it("does not treat disabled, submit, reset or navigation results as selectable", () => {
    document.body.innerHTML = `
      <ul data-search-results>
        <li><button id="disabled" type="button" disabled>가상대학교</button></li>
        <li><button id="submit" type="submit">가상대학교</button></li>
        <li><button id="reset" type="reset">가상대학교</button></li>
        <li><a id="nav" href="/another-page">가상대학교</a></li>
        <li><a id="safe" href="#">가상대학교</a></li>
      </ul>
      <button id="unrelated" type="button">가상대학교</button>`;
    const candidates = resultCandidates(document, "가상대학교");
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "disabled",
      "submit",
      "reset",
      "nav",
      "safe",
    ]);
    expect(
      safeResultActivation(
        document.querySelector("#disabled") as HTMLButtonElement,
      ),
    ).toBe(false);
    expect(
      safeResultActivation(
        document.querySelector("#submit") as HTMLButtonElement,
      ),
    ).toBe(false);
    expect(
      safeResultActivation(
        document.querySelector("#reset") as HTMLButtonElement,
      ),
    ).toBe(false);
    expect(
      safeResultActivation(document.querySelector("#nav") as HTMLAnchorElement),
    ).toBe(false);
    expect(
      safeResultActivation(
        document.querySelector("#safe") as HTMLAnchorElement,
      ),
    ).toBe(true);
  });

  it("rejects result anchors that download, target another window, or run a high-risk action", () => {
    document.body.innerHTML = `<ul role="listbox">
      <li><a id="download" href="#" download>가상대학교</a></li>
      <li><a id="target" href="#" target="_blank">가상대학교</a></li>
      <li><a id="save" href="#" aria-label="저장">가상대학교</a></li>
    </ul>`;
    expect(
      safeResultActivation(
        document.querySelector("#download") as HTMLAnchorElement,
      ),
    ).toBe(false);
    expect(
      safeResultActivation(
        document.querySelector("#target") as HTMLAnchorElement,
      ),
    ).toBe(false);
    expect(
      safeResultActivation(
        document.querySelector("#save") as HTMLAnchorElement,
      ),
    ).toBe(false);
  });

  it("rejects near-match results and keeps exact duplicates ambiguous", () => {
    document.body.innerHTML = `<ul role="listbox">
      <li><a href="#">가상지역</a></li>
      <li><a href="#">가상지역</a></li>
      <li><a href="#">가상지역시</a></li>
    </ul>`;
    expect(resultCandidates(document, "가상지역시")).toHaveLength(1);
    expect(resultCandidates(document, "가상지역")).toHaveLength(2);
  });

  it.each([
    ["서울", "서울특별시"],
    ["광주", "광주광역시"],
  ])(
    "matches the canonical school region %s to the official popup label %s",
    (canonical, official) => {
      document.body.innerHTML = `<ul><li><a href="javascript:setSchoolPlaceData('code||${official}||KOR');">${official}</a></li></ul>`;
      const candidates = resultCandidates(
        document,
        [canonical, official],
        true,
      );
      expect(candidates).toHaveLength(1);
      // Legacy javascript: URLs are intentionally unsupported; never execute MAIN callbacks.
      expect(safeResultActivation(candidates[0]!, true)).toBe(false);
      candidates[0]!.setAttribute(
        "href",
        `javascript:deleteSchoolPlaceData('code||${official}||KOR');`,
      );
      expect(safeResultActivation(candidates[0]!, true)).toBe(false);
    },
  );
});
