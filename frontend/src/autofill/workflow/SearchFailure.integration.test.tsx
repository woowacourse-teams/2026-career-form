import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedSearchWrites } from "../write/search-executor";
import type { ApprovedWriteResult } from "../write/executor";
import { WorkflowResults } from "./WorkflowResults";

const specs = [
  {
    id: "school",
    label: "학교명",
    key: "education.university.schoolName",
    value: "합성대학교",
  },
  {
    id: "region",
    label: "학교소재지",
    key: "education.university.schoolRegion",
    value: "서울",
  },
  {
    id: "other",
    label: "학교명",
    key: "education.highSchool.schoolName",
    value: "합성고등학교",
  },
] as const;

function setup(submitKind: "input" | "button") {
  document.body.innerHTML = specs
    .map(
      ({ id, label }) => `
    <div data-repeater-item="${id}"><dl><dt>${label}</dt><dd>
      <input id="${id}" type="text" readonly aria-label="${label}" value="${id === "other" ? "기존 합성값" : ""}">
      <input id="${id}-code" type="hidden" value="synthetic-${id}-code">
      <button id="${id}-opener" type="button">${label} 검색</button>
    </dd></dl></div>`,
    )
    .join("");
  const registry = new CandidateRegistry();
  const items: ReviewPlanItem[] = specs.map(({ id, label, key, value }) => {
    const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
    registry.registerField({
      kind: "field",
      candidateId: id,
      sectionId: `section-${id}`,
      signature: createStructuralSignature([input]),
      elements: [input],
      optionElements: new Map(),
      candidate: {
        candidateId: id,
        element: "input",
        control: "text",
        visibility: "visible",
        readonly: true,
        semanticContext: { inputType: "text" },
      },
    });
    return {
      candidateId: id,
      fieldLabel: label,
      profileEntryId: `entry-${id}`,
      currentValue: input.value,
      profileValue: value,
      previewValue: value,
      status: "needs-review",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "",
      analysis: {
        candidateId: id,
        matchType: "MATCH",
        valueBinding: { type: "DIRECT", profileFieldKey: key },
        mappingStatus: "LLM_SUGGESTED",
        autofillPolicy: "CONDITIONAL",
        interactionStatus: "READY",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    };
  });
  const openerClicks = { school: 0, region: 0, other: 0 };
  let submitCount = 0;
  let selectionCount = 0;
  document
    .querySelector<HTMLButtonElement>("#school-opener")!
    .addEventListener("click", (event) => {
      openerClicks.school++;
      const opener = event.currentTarget as HTMLButtonElement;
      const dialog = document.createElement("div");
      dialog.id = "synthetic-school-search";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      opener.setAttribute("aria-controls", dialog.id);
      const frame = document.createElement("iframe");
      frame.srcdoc = "<!doctype html><html><body></body></html>";
      dialog.append(frame);
      document.body.append(dialog);
      const popup = frame.contentDocument!;
      // jsdom does not navigate srcdoc; preserve the browser document URL in this fixture.
      Object.defineProperty(popup, "URL", {
        configurable: true,
        value: "about:srcdoc",
      });
      Object.defineProperty(popup, "readyState", {
        configurable: true,
        get: () => "complete",
      });
      popup.body.innerHTML = `<form method="post" action="/generic-search/search-school">
      <input type="hidden" name="rowContext" value="synthetic-row">
      <fieldset><input type="text" name="school_query" aria-label="학교 검색어">
      ${submitKind === "input" ? '<input type="submit" value="검색">' : '<button type="submit">검색</button>'}</fieldset>
      <ul aria-label="검색 결과"><li><a href="javascript:;"
      onclick="syntheticSelect('synthetic-id','합성대학교','synthetic-code')">합성대학교</a></li></ul></form>`;
      popup.querySelector("form")!.addEventListener("submit", (event) => {
        submitCount++;
        event.preventDefault();
      });
      popup.querySelector("li a")!.addEventListener("click", (event) => {
        selectionCount++;
        event.preventDefault();
      });
    });
  document
    .querySelector("#region-opener")!
    .addEventListener("click", () => openerClicks.region++);
  document
    .querySelector("#other-opener")!
    .addEventListener("click", () => openerClicks.other++);
  return {
    registry,
    items,
    openerClicks,
    counts: () => ({ submitCount, selectionCount }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

it.each(["input", "button"] as const)(
  "routes a real rejected POST/hidden school search with %s submit to distinct UI guidance without opening a later region",
  async (submitKind) => {
    vi.useFakeTimers();
    const test = setup(submitKind);
    const unapproved: ApprovedWriteResult = {
      candidateId: "other",
      status: "skipped",
      outcome: "needs-verification",
      code: "NOT_APPROVED",
      reason: "승인하지 않은 항목",
    };
    const results: ApprovedWriteResult[] = [
      { candidateId: "school", status: "skipped", reason: "pending" },
      { candidateId: "region", status: "skipped", reason: "pending" },
      unapproved,
    ];
    const pending = executeApprovedSearchWrites({
      items: test.items,
      approvedCandidateIds: new Set(["school", "region"]),
      registry: test.registry,
      results,
    });
    await vi.runAllTimersAsync();
    expect(await pending).toBe(true);
    expect(results[0]).toMatchObject({
      status: "skipped",
      failureCode: "SEARCH_FORM_UNVERIFIED",
      reason: "검색 폼과 지원서 제출 동작을 안전하게 구분할 수 없습니다.",
    });
    expect(results[1]).toMatchObject({
      status: "skipped",
      failureCode: "SEARCH_FOLLOWUP_HALTED",
    });
    expect(results[2]).toBe(unapproved);
    expect(test.openerClicks).toEqual({ school: 1, region: 0, other: 0 });
    expect(test.counts()).toEqual({ submitCount: 0, selectionCount: 0 });
    for (const { id } of specs) {
      expect(document.querySelector<HTMLInputElement>(`#${id}`)!.value).toBe(
        id === "other" ? "기존 합성값" : "",
      );
      expect(
        document.querySelector<HTMLInputElement>(`#${id}-code`)!.value,
      ).toBe(`synthetic-${id}-code`);
    }
    render(<WorkflowResults reviewItems={test.items} results={results} />);
    expect(
      screen.getByText(
        "검색창 구조를 안전하게 확인하지 못해 입력을 보류했어요.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("앞선 검색 실패로 후속 입력을 보류했어요."),
    ).toBeVisible();
    expect(screen.getByLabelText("입력 완료 0개")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /unverified_search_form|synthetic-row|javascript:syntheticSelect/,
      ),
    ).not.toBeInTheDocument();
  },
);
