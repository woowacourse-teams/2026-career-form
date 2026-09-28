import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { executeReadonlySearch } from "./readonly-search-executor";
import { installVerifiedJsResultClickBridge } from "./js-result-click-bridge";
import { safeActivation } from "./search-surface-dom";
import { validateFieldsResponse } from "../api/validate-response";
import { buildReviewPlan } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";

type Scenario = {
  key?: string;
  openerCount?: number;
  popupCount?: number;
  inaccessible?: boolean;
  queryCount?: number;
  submitCount?: number;
  resultCount?: number;
  resultType?: string;
  resultDisabled?: boolean;
  reflect?: boolean;
  transient?: boolean;
  existing?: string;
  queryValue?: string;
  directRegion?: boolean;
  legacySchool?: boolean;
  legacyDiagnosticButton?: boolean;
  completeRegion?: boolean;
  expectedValue?: string;
  reflectedValue?: string;
  existingHighRegion?: boolean;
  navigateAfterSelection?: boolean;
  cleanupFrameOnClose?: boolean;
  mutation?:
    | "target"
    | "group"
    | "row"
    | "frame"
    | "type"
    | "disabled"
    | "inert"
    | "query"
    | "submit"
    | "approval";
};

type NativeFormScenario = {
  method: "get" | "post";
  mutateBeforeSubmit?: "action" | "hidden" | "method" | "query-name";
  firstQueryMiss?: boolean;
};

function nativeFormFixture(options: NativeFormScenario) {
  document.body.innerHTML = `
    <div data-repeater-item><label>전공
      <input id="target" type="text" readonly aria-label="전공"></label>
      <button id="opener" type="button">전공 검색</button>
    </div>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    })!;
  const actions = { opener: 0, search: 0, result: 0 };
  opener.addEventListener("click", () => {
    actions.opener++;
    const surface = document.createElement("div");
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    const frame = document.createElement("iframe");
    frame.srcdoc = "<!doctype html><html><body></body></html>";
    surface.append(frame);
    opener.setAttribute(
      "aria-controls",
      (surface.id = "native-search-surface"),
    );
    document.body.append(surface);
    let live = frame.contentDocument!;
    Object.defineProperty(live, "readyState", {
      configurable: true,
      value: "complete",
    });
    Object.defineProperty(live, "URL", {
      configurable: true,
      value: "about:srcdoc",
    });
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get: () => live,
    });
    const responseDocument = (queryText: string) => {
      const responseFrame = document.createElement("iframe");
      responseFrame.hidden = true;
      document.body.append(responseFrame);
      const response = responseFrame.contentDocument!;
      const responseUrl = new URL("/search/credentials", document.URL);
      if (options.method === "get") {
        responseUrl.searchParams.set("route", "credential");
        responseUrl.searchParams.set("keyword", queryText);
      }
      Object.defineProperty(response, "URL", {
        configurable: true,
        value: responseUrl.href,
      });
      Object.defineProperty(response, "readyState", {
        configurable: true,
        value: "complete",
      });
      const firstMiss = options.firstQueryMiss && actions.search === 1;
      response.body.innerHTML = `
          ${
            firstMiss
              ? `<form method="${options.method}" action="/search/credentials" target="_self">
            <input id="query" name="keyword" type="text" aria-label="자격 검색어">
            <input id="route" name="route" type="hidden" value="credential">
            <button id="submit" type="submit" aria-label="검색">검색</button>
          </form>`
              : ""
          }
          <ul aria-label="검색 결과" data-result-count="1">
            <li><button type="button">${firstMiss ? "다른값" : "가상값"}</button></li>
          </ul>`;
      response.querySelector("ul button")!.addEventListener("click", () => {
        actions.result++;
        target.value = "가상값";
        surface.remove();
      });
      live = response;
      if (firstMiss) bindForm(response, false);
    };
    const bindForm = (popup: Document, allowMutation: boolean) => {
      const query = popup.querySelector<HTMLInputElement>("#query")!;
      const form = popup.querySelector<HTMLFormElement>("form")!;
      query.addEventListener("input", () => {
        if (!allowMutation) return;
        switch (options.mutateBeforeSubmit) {
          case "action":
            form.action = "/search/other";
            break;
          case "hidden":
            popup.querySelector<HTMLInputElement>("#route")!.value = "other";
            break;
          case "method":
            form.method = options.method === "get" ? "post" : "get";
            break;
          case "query-name":
            query.name = "otherKeyword";
            break;
        }
      });
      popup
        .querySelector<HTMLButtonElement>("#submit")!
        .addEventListener("click", (event) => {
          event.preventDefault();
          actions.search++;
          responseDocument(query.value);
        });
    };
    live.body.innerHTML = `
      <form method="${options.method}" action="/search/credentials" target="_self">
        <input id="query" name="keyword" type="text" aria-label="자격 검색어">
        <input id="route" name="route" type="hidden" value="credential">
        <button id="submit" type="submit" aria-label="검색">검색</button>
      </form>`;
    bindForm(live, true);
  });
  return {
    target,
    actions,
    run: async (searchValues?: readonly string[]) => {
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: "education.university.majorName",
        expectedValue: searchValues?.[0] ?? "가상값",
        ...(searchValues ? { searchValues } : {}),
        expectedCurrentValue: "",
      });
      await vi.runAllTimersAsync();
      return pending;
    },
  };
}

type CertificateScenario = {
  candidateCode?: string;
  relation?: boolean;
  followUpGrade?: boolean;
  followUpInput?: boolean;
  firstQueryMiss?: boolean;
  firstResultState?: "incomplete" | "duplicate";
  selectedValue?: string;
  mutation?: "other-row" | "peer";
};

function certificateFixture(options: CertificateScenario = {}) {
  document.body.innerHTML = `
    <fieldset><legend>자격 및 면허</legend>
      <div data-repeater-item>
        <dl><dt>자격증명</dt><dd>
          <input id="target" type="text" readonly aria-label="자격증명">
          ${options.relation === false ? "" : '<input id="code" type="hidden" value="">'}
          <button id="opener" type="button">자격 검색</button>
        </dd></dl>
        <label>등록번호 <input id="registration" type="text" value="기존 등록번호"></label>
        ${options.followUpInput ? '<label>기관 <input id="follow-up-input" type="text" disabled value=""></label>' : ""}
        ${options.followUpGrade ? '<select id="grade" disabled><option value="">등급</option></select>' : ""}
      </div>
      <div data-repeater-item><label>다른 등록번호
        <input id="other-row" type="text" value="기존 다른 행"></label></div>
    </fieldset>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const code = document.querySelector<HTMLInputElement>("#code");
  const registration =
    document.querySelector<HTMLInputElement>("#registration")!;
  const grade = document.querySelector<HTMLSelectElement>("#grade");
  const followUpInput =
    document.querySelector<HTMLInputElement>("#follow-up-input");
  const otherRow = document.querySelector<HTMLInputElement>("#other-row")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    })!;
  const actions = { opener: 0, search: 0, result: 0 };
  let lastResult: HTMLButtonElement | undefined;
  opener.addEventListener("click", () => {
    actions.opener++;
    const surface = document.createElement("div");
    surface.id = "certificate-search-surface";
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    opener.setAttribute("aria-controls", surface.id);
    const frame = document.createElement("iframe");
    frame.srcdoc = "<!doctype html><html><body></body></html>";
    surface.append(frame);
    document.body.append(surface);
    const popup = frame.contentDocument!;
    Object.defineProperty(popup, "readyState", {
      configurable: true,
      value: "complete",
    });
    Object.defineProperty(popup, "URL", {
      configurable: true,
      value: "about:srcdoc",
    });
    popup.body.innerHTML = `
      <form><label>자격 검색어 <input id="query" type="text"></label>
        <button id="submit" type="button">검색</button>
      </form>
      <ul aria-label="검색 결과" data-search-complete="true"></ul>`;
    const query = popup.querySelector<HTMLInputElement>("#query")!;
    popup
      .querySelector<HTMLButtonElement>("#submit")!
      .addEventListener("click", () => {
        actions.search++;
        const results = popup.querySelector("ul")!;
        results.setAttribute("data-search-query", query.value);
        results.replaceChildren();
        const firstResponse = actions.search === 1;
        const duplicate =
          firstResponse && options.firstResultState === "duplicate";
        results.setAttribute("data-result-count", duplicate ? "2" : "1");
        if (firstResponse && options.firstResultState === "incomplete")
          results.setAttribute("data-has-more", "true");
        else results.removeAttribute("data-has-more");
        const result = popup.createElement("button");
        result.type = "button";
        if (options.candidateCode !== undefined)
          result.dataset.code = options.candidateCode;
        result.textContent =
          options.firstQueryMiss && actions.search === 1
            ? "다른값"
            : (options.selectedValue ?? "가상값");
        lastResult = result;
        results.append(result);
        if (duplicate) results.append(result.cloneNode(true));
        result.addEventListener("click", () => {
          actions.result++;
          target.value = options.selectedValue ?? "가상값";
          if (code) code.value = options.candidateCode ?? "code-1";
          if (grade) {
            grade.disabled = false;
            grade.append(new Option("기사", "기사"));
          }
          if (followUpInput) followUpInput.disabled = false;
          if (options.mutation === "peer") registration.value = "변경됨";
          if (options.mutation === "other-row") otherRow.value = "변경됨";
          surface.remove();
        });
      });
  });
  return {
    target,
    code,
    registration,
    grade,
    followUpInput,
    otherRow,
    actions,
    run: async (
      searchValues?: readonly string[],
      beforeMutation?: (result: HTMLButtonElement | undefined) => void,
    ) => {
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: "certifications.certificate.name",
        expectedValue: searchValues?.[0] ?? "가상값",
        ...(searchValues ? { searchValues } : {}),
        expectedCurrentValue: "",
        ...(beforeMutation
          ? {
              beforeMutation: async () => {
                beforeMutation(lastResult);
                return true;
              },
            }
          : {}),
      });
      await vi.runAllTimersAsync();
      return pending;
    },
  };
}

function fixture(options: Scenario = {}) {
  document.body.innerHTML = `${options.existingHighRegion ? `<fieldset><legend>고등학교</legend><dl><dt>학교소재지</dt><dd><input id="high-region" name="zz_state_nm" type="text" readonly placeholder="지역"><button id="high-opener" type="button" title="학교소재지 검색">검색</button></dd></dl></fieldset>` : ""}<fieldset><legend>대학교</legend><div data-repeater-item><dl><dt>${options.legacySchool ? "학교명" : "전공"}</dt><dd>
    <input id="target" type="text" readonly aria-label="${options.legacySchool ? "학교명" : "전공"}"><input id="code" type="hidden" value="initial-code">
    ${Array.from({ length: options.openerCount ?? 1 }, () => `<button type="button">${options.legacySchool ? "학교 검색" : "전공 검색"}</button>`).join("")}
  </dd></dl></div>${options.legacySchool ? `<div data-repeater-item><dl><dt>학교명</dt><dd><input id="other-row-value" readonly aria-label="다른 대학교 학교명" value="기존 합성 학교"><input id="other-row-code" type="hidden" value="synthetic-other-code"></dd></dl></div>` : ""}</fieldset>`;
  const input = document.querySelector<HTMLInputElement>("#target")!;
  const code = document.querySelector<HTMLInputElement>("#code")!;
  input.value = options.existing ?? "";
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return lookup.status === "blocked" && lookup.handle.elements[0] === input;
    })!;
  const highInput = document.querySelector<HTMLInputElement>("#high-region");
  if (highInput) highInput.value = "서울특별시";
  const highCandidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === highInput
      );
    });
  let highOpenerClicks = 0;
  document
    .querySelector("#high-opener")
    ?.addEventListener("click", () => highOpenerClicks++);
  const actions = {
    opener: 0,
    search: 0,
    result: 0,
    unsafeTargetWrites: 0,
    targetEvents: 0,
  };
  let siteSelection = false;
  let legacyQueryCount = 0;
  let approved = true;
  input.addEventListener("input", () => actions.targetEvents++);
  input.addEventListener("change", () => actions.targetEvents++);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  vi.spyOn(HTMLInputElement.prototype, "value", "set").mockImplementation(
    function (this: HTMLInputElement, value) {
      if ((this === input || this === code) && !siteSelection)
        actions.unsafeTargetWrites++;
      setter.call(this, value);
    },
  );
  document.querySelectorAll<HTMLButtonElement>("dd button").forEach((opener) =>
    opener.addEventListener("click", () => {
      actions.opener++;
      for (let i = 0; i < (options.popupCount ?? 1); i++) {
        const surface = document.createElement("div");
        surface.id = `search-surface-${actions.opener}-${i}`;
        surface.setAttribute("role", "dialog");
        surface.setAttribute("aria-modal", "true");
        const frame = document.createElement("iframe");
        frame.srcdoc = "<!doctype html><html><body></body></html>";
        opener.setAttribute("aria-controls", surface.id);
        surface.append(frame);
        document.body.append(surface);
        const popup = frame.contentDocument!;
        Object.defineProperty(popup, "readyState", {
          configurable: true,
          get: () => "complete",
        });
        if (options.inaccessible) {
          Object.defineProperty(frame, "contentDocument", {
            configurable: true,
            get: () => null,
          });
          continue;
        }
        const reflectSelection = () => {
          actions.result++;
          if (options.reflect !== false) {
            siteSelection = true;
            input.value = options.reflectedValue ?? "가상값";
            code.value = "selected-code";
            siteSelection = false;
            if (options.transient)
              setTimeout(() => {
                siteSelection = true;
                input.value = "";
                siteSelection = false;
              }, 0);
          }
          if (options.navigateAfterSelection)
            frame.setAttribute("src", "about:blank");
          else if (options.cleanupFrameOnClose) {
            surface.hidden = true;
            frame.setAttribute("src", "");
            surface.remove();
          } else if (options.completeRegion) surface.remove();
          else frame.remove();
        };
        if (options.legacySchool) {
          Object.defineProperty(popup, "URL", {
            configurable: true,
            value: "about:srcdoc",
          });
          popup.body.innerHTML = `<form method="post" action="/generic-search/search-school">
            <input type="hidden" name="rowContext" value="synthetic-row">
            <fieldset><legend>학교 검색</legend><label>학교명 입력
              <input name="school_query" type="text" aria-label="학교명 입력"></label>
              ${options.legacyDiagnosticButton ? `<button type="submit">검색</button>` : `<input type="submit" value="검색">`}</fieldset>
            <ul aria-label="검색 결과"><li><a href="javascript:;"
              onclick="selectSyntheticSchool('synthetic-id','합성대학교','synthetic-code')">합성대학교</a></li></ul>
          </form>`;
          popup
            .querySelector<HTMLInputElement>("[name=school_query]")!
            .addEventListener("input", () => legacyQueryCount++);
          popup.querySelector("form")!.addEventListener("submit", (event) => {
            event.preventDefault();
            actions.search++;
          });
          popup.querySelector("a")!.addEventListener("click", (event) => {
            event.preventDefault();
            actions.result++;
          });
        } else if (options.completeRegion) {
          Object.defineProperty(popup, "URL", {
            configurable: true,
            value: "about:srcdoc",
          });
          const regions = [
            "강원특별자치도",
            "경기도",
            "경상남도",
            "경상북도",
            "광주광역시",
            "대구광역시",
            "대전광역시",
            "부산광역시",
            "서울특별시",
            "세종특별자치시",
            "울산광역시",
            "인천광역시",
            "전라남도",
            "전북특별자치도",
            "제주특별자치도",
            "충청남도",
            "충청북도",
          ];
          popup.body.innerHTML = `<h1>지역 선택</h1><select><option value="KOR" selected>한국</option></select><ul>${regions.map((region) => `<li><a href="javascript:setSchoolPlaceData('ST||${region}||KOR');">${region}</a></li>`).join("")}</ul>`;
          installVerifiedJsResultClickBridge(popup);
          popup.querySelectorAll("li a").forEach((link) =>
            link.addEventListener("click", (event) => {
              event.preventDefault(); // Simulate the site's native callback effect.
              reflectSelection();
            }),
          );
        } else if (options.directRegion) {
          const official = options.reflectedValue ?? "서울특별시";
          popup.body.innerHTML = `<label for="country">국가</label>
            <select id="country" name="country_cd"><option value="KOR" selected>한국</option></select>
            <ul><li><a href="javascript:setSchoolPlaceData('code||${official}||KOR');">${official}</a></li></ul>`;
          (
            popup.defaultView as Window & {
              setSchoolPlaceData?: (value: string) => void;
            }
          ).setSchoolPlaceData = () => reflectSelection();
        } else {
          popup.body.innerHTML = `<form><label for="query">검색어 입력</label>
          ${Array.from({ length: options.queryCount ?? 1 }, (_, index) => `<input id="query${index || ""}" type="text" aria-label="검색어 입력">`).join("")}
          ${Array.from({ length: options.submitCount ?? 1 }, () => '<button type="button">검색</button>').join("")}
          </form><ul aria-label="검색 결과" data-search-complete="true"></ul>`;
          const query = popup.querySelector<HTMLInputElement>("input");
          if (query) query.value = options.queryValue ?? "";
          query?.addEventListener("input", () => {
            switch (options.mutation) {
              case "target":
                input.replaceWith(input.cloneNode());
                break;
              case "group": {
                const group = document.createElement("dd");
                input.closest("dl")!.append(group);
                group.append(input);
                break;
              }
              case "row": {
                const row = document.createElement("div");
                row.dataset.repeaterItem = "new";
                document.body.append(row);
                row.append(input.closest("dl")!);
                break;
              }
              case "frame":
                frame.contentDocument!.open();
                frame.contentDocument!.write("<p>replacement</p>");
                frame.contentDocument!.close();
                break;
              case "type":
                input.type = "email";
                break;
              case "disabled":
                input.disabled = true;
                break;
              case "inert":
                input.parentElement!.setAttribute("inert", "");
                break;
              case "query":
                query.value = "다른 검색어";
                break;
              case "submit":
                popup
                  .querySelector("form")!
                  .append(popup.querySelector("button")!.cloneNode(true));
                break;
              case "approval":
                approved = false;
                break;
            }
          });
          popup
            .querySelectorAll<HTMLButtonElement>("form button")
            .forEach((submit) =>
              submit.addEventListener("click", () => {
                actions.search++;
                const resultRoot = popup.querySelector("ul");
                resultRoot?.setAttribute(
                  "data-search-query",
                  query?.value ?? "",
                );
                resultRoot?.setAttribute(
                  "data-result-count",
                  String(options.resultCount ?? 1),
                );
                for (
                  let resultIndex = 0;
                  resultIndex < (options.resultCount ?? 1);
                  resultIndex++
                ) {
                  const result = popup.createElement("button");
                  result.type = (options.resultType ?? "button") as
                    "button" | "submit" | "reset";
                  result.disabled = options.resultDisabled ?? false;
                  result.textContent = options.reflectedValue ?? "가상값";
                  const row = popup.createElement("li");
                  row.append(result);
                  popup.querySelector("ul")!.append(row);
                  result.addEventListener("click", reflectSelection);
                }
              }),
            );
        }
      }
    }),
  );
  return {
    input,
    code,
    snapshot,
    candidate,
    highInput,
    highCandidate,
    highOpenerClicks: () => highOpenerClicks,
    actions,
    legacyQueryCount: () => legacyQueryCount,
    run: async () => {
      const pending = executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: options.key ?? "education.university.majorName",
        expectedValue: options.expectedValue ?? "가상값",
        expectedCurrentValue: options.existing ?? "",
        assertCurrent: () => approved,
      });
      await vi.runAllTimersAsync();
      return pending;
    },
  };
}

describe("readonly search transaction", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it.each(["get", "post"] as const)(
    "follows a same-iframe %s form into one query-bound response generation",
    async (method) => {
      const test = nativeFormFixture({ method });

      expect(await test.run()).toMatchObject({
        status: "selected",
        effect: "value-observed",
      });
      expect(test.target.value).toBe("가상값");
      expect(test.actions).toEqual({ opener: 1, search: 1, result: 1 });
    },
  );

  it.each(["get", "post"] as const)(
    "rebinds a same-iframe %s form only after its complete original query has no exact result",
    async (method) => {
      const test = nativeFormFixture({ method, firstQueryMiss: true });

      const result = await test.run(["가상값기사", "가상값"]);
      expect(result).toMatchObject({
        status: "selected",
        selectedValue: "가상값",
      });
      expect(test.target.value).toBe("가상값");
      expect(test.actions).toEqual({ opener: 1, search: 2, result: 1 });
    },
  );

  it.each(["action", "hidden", "method", "query-name"] as const)(
    "does not submit when the initially bound native form changes its %s",
    async (mutateBeforeSubmit) => {
      const test = nativeFormFixture({
        method: "post",
        mutateBeforeSubmit,
      });

      expect(await test.run()).toMatchObject({
        status: "failed",
        reason: "surface_stale",
        effect: "interaction-started",
      });
      expect(test.target.value).toBe("");
      expect(test.actions).toEqual({ opener: 1, search: 0, result: 0 });
    },
  );

  it.each([
    ["a missing relation control", { relation: false }],
    [
      "a result without an explicit relation value",
      { candidateCode: undefined },
    ],
  ] as const)(
    "does not click a certificate result with %s",
    async (_name, options) => {
      const test = certificateFixture(options);

      expect(await test.run()).toMatchObject({
        status: "failed",
        reason: "selection_effect_unverified",
        effect: "interaction-started",
      });
      expect(test.target.value).toBe("");
      expect(test.actions).toEqual({ opener: 1, search: 1, result: 0 });
    },
  );

  it.each(["peer", "other-row"] as const)(
    "reports a partial certificate selection and stops after an unexpected %s change",
    async (mutation) => {
      const test = certificateFixture({ candidateCode: "code-1", mutation });

      expect(await test.run()).toMatchObject({
        status: "failed",
        reason: "selection_postcondition_failed",
        effect: "value-observed",
      });
      expect(test.target.value).toBe("가상값");
      expect(test.code?.value).toBe("code-1");
      expect(test.actions).toEqual({ opener: 1, search: 1, result: 1 });
      expect(
        mutation === "peer" ? test.registration.value : test.otherRow.value,
      ).toBe("변경됨");
    },
  );

  it("returns only a verified same-row grade control for follow-up analysis", async () => {
    const test = certificateFixture({
      candidateCode: "code-1",
      followUpGrade: true,
    });

    expect(await test.run()).toMatchObject({
      status: "selected",
      followUp: { controls: [test.grade] },
    });
    expect(test.actions).toEqual({ opener: 1, search: 1, result: 1 });
  });

  it("allows a search to expose a disabled same-row text control and returns it for review", async () => {
    const test = certificateFixture({
      candidateCode: "code-1",
      followUpInput: true,
    });

    expect(await test.run()).toMatchObject({
      status: "selected",
      followUp: { controls: [test.followUpInput] },
    });
    expect(test.followUpInput?.value).toBe("");
  });

  it("retries one reviewed split search only after a complete original query has no exact result", async () => {
    const test = certificateFixture({
      candidateCode: "code-1",
      firstQueryMiss: true,
      selectedValue: "가상 자격",
    });

    expect(await test.run(["가상 자격 기사", "가상 자격"])).toMatchObject({
      status: "selected",
      selectedValue: "가상 자격",
    });
    expect(test.target.value).toBe("가상 자격");
    expect(test.actions).toEqual({ opener: 1, search: 2, result: 1 });
  });

  it.each([
    ["incomplete", "result_set_incomplete"],
    ["duplicate", "multiple_matching_results"],
  ] as const)(
    "does not retry a split search after a %s first result set",
    async (firstResultState, reason) => {
      const test = certificateFixture({
        candidateCode: "code-1",
        firstResultState,
      });

      expect(await test.run(["가상값", "다른값"])).toMatchObject({
        status: "failed",
        reason,
        effect: "interaction-started",
      });
      expect(test.actions).toEqual({ opener: 1, search: 1, result: 0 });
    },
  );

  it("does not retry a split search after its selected first result becomes stale", async () => {
    const test = certificateFixture({ candidateCode: "code-1" });

    expect(
      await test.run(["가상값", "다른값"], (result) => {
        if (result) result.dataset.code = "changed";
      }),
    ).toMatchObject({
      status: "failed",
      reason: "result_stale",
      effect: "interaction-started",
    });
    expect(test.actions).toEqual({ opener: 1, search: 1, result: 0 });
  });

  it("rejects more than two local search forms before opening the search surface", async () => {
    const test = certificateFixture({ candidateCode: "code-1" });

    expect(await test.run(["가상값", "다른값", "세번째 값"])).toMatchObject({
      status: "unsupported",
      reason: "stale_target",
      effect: "none",
    });
    expect(test.actions).toEqual({ opener: 0, search: 0, result: 0 });
  });

  it("leaves a prefilled high-school region unchanged and selects only the empty university region", async () => {
    const test = fixture({
      existingHighRegion: true,
      key: "education.university.schoolRegion",
      completeRegion: true,
      expectedValue: "경기",
      reflectedValue: "경기도",
    });
    const high = executeReadonlySearch({
      document,
      registry: test.snapshot.registry,
      targetCandidateId: test.highCandidate!.candidateId,
      canonicalFieldKey: "education.highSchool.schoolRegion",
      expectedValue: "서울",
      expectedCurrentValue: "서울특별시",
    });
    await vi.runAllTimersAsync();
    expect(await high).toMatchObject({ status: "unchanged", effect: "none" });
    expect(test.highOpenerClicks()).toBe(0);
    expect(await test.run()).toMatchObject({ status: "selected" });
    expect(test.highInput!.value).toBe("서울특별시");
    expect(test.input.value).toBe("경기도");
    expect(test.actions).toMatchObject({
      opener: 1,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });

  it("accepts a reflected university region when the owned popup hides, clears its iframe src and removes it", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      completeRegion: true,
      cleanupFrameOnClose: true,
      expectedValue: "서울",
      reflectedValue: "서울특별시",
    });
    expect(await test.run()).toMatchObject({
      status: "selected",
      effect: "value-observed",
    });
    expect(test.input.value).toBe("서울특별시");
    expect(test.actions).toMatchObject({
      opener: 1,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });

  it("does not accept iframe cleanup without the university value being reflected", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      completeRegion: true,
      cleanupFrameOnClose: true,
      expectedValue: "서울",
      reflect: false,
    });
    expect(await test.run()).toMatchObject({
      status: "failed",
      reason: "popup_unresolved",
    });
    expect(test.input.value).toBe("");
  });

  it("blocks unexpected navigation of an open university popup after result selection", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      completeRegion: true,
      expectedValue: "서울",
      reflectedValue: "서울특별시",
      navigateAfterSelection: true,
    });
    expect(await test.run()).toMatchObject({
      status: "failed",
      reason: "surface_navigation_unsafe",
      effect: "interaction-started",
    });
    expect(test.actions).toMatchObject({
      opener: 1,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });

  it("does not confirm a closed university popup without a reflected region", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      completeRegion: true,
      expectedValue: "서울",
      reflect: false,
    });
    expect(await test.run()).toMatchObject({
      status: "failed",
      reason: "popup_unresolved",
      effect: "interaction-started",
    });
    expect(test.input.value).toBe("");
    expect(test.actions).toMatchObject({
      opener: 1,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });

  it("uses one original result click for a complete queryless domestic region list", async () => {
    const test = fixture({
      key: "education.highSchool.schoolRegion",
      completeRegion: true,
      expectedValue: "서울",
      reflectedValue: "서울특별시",
    });
    const result = await test.run();
    expect(result.status).toBe("selected");
    expect(test.input.value).toBe("서울특별시");
    expect(test.code.value).toBe("selected-code");
    expect(test.actions).toMatchObject({
      opener: 1,
      search: 0,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });
  it("fails closed for a legacy school-region javascript callback", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      directRegion: true,
      expectedValue: "서울",
      reflectedValue: "서울특별시",
    });
    expect((await test.run()).status).not.toBe("selected");
    expect(test.input.value).toBe("");
    expect(test.code.value).toBe("initial-code");
    expect(test.actions).toMatchObject({ opener: 1, search: 0, result: 0 });
    expect(test.actions.unsafeTargetWrites).toBe(0);
  });

  it.each([
    ["original unlabelled submit input", false, "unverified_search_form"],
    [
      "separately labelled diagnostic submit button",
      true,
      "unverified_search_form",
    ],
  ] as const)(
    "rejects POST/hidden school form with %s without changing either school row",
    async (_name, diagnostic, reason) => {
      const test = fixture({
        key: "education.university.schoolName",
        legacySchool: true,
        legacyDiagnosticButton: diagnostic,
        expectedValue: "합성대학교",
      });
      const otherInput =
        document.querySelector<HTMLInputElement>("#other-row-value")!;
      const otherCode =
        document.querySelector<HTMLInputElement>("#other-row-code")!;
      const original = {
        value: test.input.value,
        code: test.code.value,
        otherValue: otherInput.value,
        otherCode: otherCode.value,
      };
      const result = await test.run();
      expect(test.legacyQueryCount()).toBe(0);
      expect(result).toMatchObject({
        status: "failed",
        reason,
        effect: "interaction-started",
      });
      expect(test.actions).toEqual({
        opener: 1,
        search: 0,
        result: 0,
        unsafeTargetWrites: 0,
        targetEvents: 0,
      });
      expect({
        value: test.input.value,
        code: test.code.value,
        otherValue: otherInput.value,
        otherCode: otherCode.value,
      }).toEqual(original);
      const popup =
        document.querySelector<HTMLIFrameElement>("iframe")!.contentDocument!;
      const form = popup.querySelector("form")!;
      expect(form.method).toBe("post");
      expect(
        form.querySelector(
          diagnostic ? "button[type=submit]" : "input[type=submit][value=검색]",
        ),
      ).not.toBeNull();
      expect(
        form.querySelector("input[type=hidden]")?.getAttribute("value"),
      ).toBe("synthetic-row");
      expect(
        form.querySelector("fieldset input[name=school_query]"),
      ).not.toBeNull();
      expect(form.querySelector("ul > li > a")?.getAttribute("href")).toBe(
        "javascript:;",
      );
    },
  );

  it("rejects a form-internal literal onclick even when its href is inert", () => {
    document.body.innerHTML = `<form><ul><li><a href="javascript:;"
      onclick="selectSyntheticSchool('synthetic-id','합성대학교','synthetic-code')">합성대학교</a></li></ul></form>`;
    const link = document.querySelector<HTMLAnchorElement>("a")!;
    expect(safeActivation(link, ["합성대학교"])).toBe(false);
  });

  it("selects a unique region from the complete KOR list independently and preserves the other row", async () => {
    const test = fixture({
      existingHighRegion: true,
      key: "education.university.schoolRegion",
      completeRegion: true,
      expectedValue: "서울",
      reflectedValue: "서울특별시",
    });
    const result = await test.run();
    expect(result).toMatchObject({
      status: "selected",
      effect: "value-observed",
    });
    expect(test.input.value).toBe("서울특별시");
    expect(test.code.value).toBe("selected-code");
    expect(test.highInput!.value).toBe("서울특별시");
    expect(test.highOpenerClicks()).toBe(0);
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(test.actions).toMatchObject({
      opener: 1,
      search: 0,
      result: 1,
      unsafeTargetWrites: 0,
    });
  });

  it("does not open the KOR list when a different region already exists", async () => {
    const test = fixture({
      key: "education.university.schoolRegion",
      completeRegion: true,
      existing: "경기도",
      expectedValue: "서울",
    });
    expect(await test.run()).toMatchObject({
      status: "unsupported",
      reason: "existing_value_conflict",
      effect: "none",
    });
    expect(test.input.value).toBe("경기도");
    expect(test.code.value).toBe("initial-code");
    expect(test.actions).toMatchObject({ opener: 0, search: 0, result: 0 });
  });

  it.each([
    "education.university.schoolName",
    "education.university.schoolRegion",
    "education.university.majorName",
    "education.highSchool.schoolName",
    "education.graduateSchool.schoolName",
  ])(
    "rejects an iframe without a settled accessible surface for %s",
    async (key) => {
      const test = fixture({ key });
      expect((await test.run()).status).not.toBe("selected");
      expect(test.input.value).toBe("");
      expect(test.code.value).toBe("initial-code");
      expect(test.input.readOnly).toBe(true);
      expect(test.actions).toEqual({
        opener: 1,
        search: 0,
        result: 0,
        unsafeTargetWrites: 0,
        targetEvents: 0,
      });
    },
  );

  it.each([
    ["no opener", { openerCount: 0 }],
    ["two openers", { openerCount: 2 }],
    ["no popup", { popupCount: 0 }],
    ["two popups", { popupCount: 2 }],
    ["inaccessible popup", { inaccessible: true }],
    ["no query", { queryCount: 0 }],
    ["two queries", { queryCount: 2 }],
    ["no submit", { submitCount: 0 }],
    ["two submits", { submitCount: 2 }],
    ["no result", { resultCount: 0 }],
    ["duplicate results", { resultCount: 2 }],
    ["disabled result", { resultDisabled: true }],
    ["reset result", { resultType: "reset" }],
    ["submit result", { resultType: "submit" }],
    ["existing query", { queryValue: "기존 검색어" }],
  ] satisfies [string, Scenario][])(
    "stops %s without result selection or target writes",
    async (_name, options) => {
      const test = fixture(options);
      expect((await test.run()).status).not.toBe("selected");
      expect(test.actions.result).toBe(0);
      expect(test.actions.unsafeTargetWrites).toBe(0);
      expect(test.input.value).toBe("");
      expect(test.code.value).toBe("initial-code");
    },
  );

  it.each([
    "target",
    "group",
    "row",
    "frame",
    "type",
    "disabled",
    "inert",
    "query",
    "submit",
    "approval",
  ] as const)(
    "revalidates %s after query input before search click",
    async (mutation) => {
      const test = fixture({ mutation });
      expect((await test.run()).status).not.toBe("selected");
      expect(test.actions.search).toBe(0);
      expect(test.actions.result).toBe(0);
      expect(test.actions.unsafeTargetWrites).toBe(0);
    },
  );

  it.each([{ reflect: false }, { transient: true }])(
    "does not claim retained success for %j",
    async (options) => {
      const test = fixture(options);
      expect(await test.run()).toMatchObject({
        reason: "surface_not_found",
      });
      expect(test.actions.unsafeTargetWrites).toBe(0);
    },
  );

  it("preserves a conflicting existing value without opening a popup", async () => {
    const test = fixture({ existing: "기존 값" });
    expect(await test.run()).toMatchObject({
      reason: "existing_value_conflict",
    });
    expect(test.actions.opener).toBe(0);
    expect(test.input.value).toBe("기존 값");
  });

  it("retains an already equal value without searching again", async () => {
    const test = fixture({ existing: "가상값" });
    expect(await test.run()).toMatchObject({ status: "unchanged" });
    expect(test.actions.opener).toBe(0);
    expect(test.actions.unsafeTargetWrites).toBe(0);
  });

  it.each(["schoolName", "schoolRegion", "majorName"] as const)(
    "connects collection, API validation, review and settled writer for %s",
    async (field) => {
      const expectedValue = field === "schoolRegion" ? "서울" : "가상값";
      const test = fixture({ expectedValue, reflectedValue: expectedValue });
      const analysis = validateFieldsResponse(test.snapshot.request, {
        snapshotId: test.snapshot.request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: test.candidate.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: `education.university.${field}`,
            },
            autofillPolicy: "CONDITIONAL",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SEARCH_SELECTION" },
          },
        ],
      });
      const { items } = buildReviewPlan({
        analysis,
        registry: test.snapshot.registry,
        profile: {
          ...createEmptyProfile(),
          education: [
            {
              id: "synthetic",
              sectionId: "university",
              values: {
                [field]: field === "schoolRegion" ? "region:seoul" : "가상값",
              },
            },
          ],
        },
      });
      expect(items[0]?.disabled).toBe(false);
      const pending = executeApprovedWritesAfterPageSettles({
        items: items.map((item) => ({ ...item, selected: true })),
        approvedCandidateIds: new Set([test.candidate.candidateId]),
        registry: test.snapshot.registry,
      });
      await vi.runAllTimersAsync();
      expect(await pending).toEqual([
        expect.objectContaining({
          status: "skipped",
          outcome: "needs-verification",
        }),
      ]);
      expect(test.input.value).toBe("");
      expect(test.actions.unsafeTargetWrites).toBe(0);
      expect(test.actions.result).toBe(0);
    },
  );
});

describe("readonly search execution guards", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("fails closed before opening a popup for an invalid binding or empty profile value", async () => {
    const invalid = fixture({ key: "not-a-profile-field" });
    expect(await invalid.run()).toMatchObject({ reason: "field_not_readonly" });
    const empty = fixture();
    expect(
      await executeReadonlySearch({
        document,
        registry: empty.snapshot.registry,
        targetCandidateId: empty.candidate.candidateId,
        canonicalFieldKey: "education.university.majorName",
        expectedValue: "",
      }),
    ).toMatchObject({ reason: "field_not_readonly" });
  });

  it("preserves a nonmatching existing readonly value without interaction", async () => {
    const test = fixture({ existing: "기존 값" });
    expect(await test.run()).toMatchObject({
      reason: "existing_value_conflict",
    });
    expect(test.actions.opener).toBe(0);
    expect(test.actions.unsafeTargetWrites).toBe(0);
  });
});
