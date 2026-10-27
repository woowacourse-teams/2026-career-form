import { afterEach, describe, expect, it } from "vitest";

import { collectFieldsSnapshot } from "../dom/collect";
import {
  defersToReflectedQuery,
  executeReadonlySearch,
} from "./readonly-search-executor";

let listeners = new AbortController();

afterEach(() => {
  listeners.abort();
  listeners = new AbortController();
  document.body.replaceChildren();
});

function queryBoundSearch(options: { revertOnClose: boolean }) {
  document.body.innerHTML = `
    <div data-repeater-item><dl><dt>학교명</dt><dd>
      <input id="target" type="text" readonly aria-label="학교명">
      <button id="opener" type="button">학교명 검색</button>
    </dd></dl></div>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
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
  document.querySelector("#opener")!.addEventListener("click", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="dialog" role="dialog" aria-modal="true" aria-label="학교 검색">
        <input id="query" type="text" aria-label="학교 검색어">
        <button id="search" type="button">검색</button>
        <ul aria-label="검색 결과"></ul>
      </div>`,
    );
    const query = document.querySelector<HTMLInputElement>("#query")!;
    // The page mirrors the typed query into the field it edits.
    query.addEventListener("input", () => {
      target.value = query.value;
    });
    document.querySelector("#search")!.addEventListener("click", () => {
      document.querySelector("#dialog ul")!.innerHTML =
        `<li><a href="javascript:void(0)">${query.value}</a></li>`;
    });
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (options.revertOnClose) target.value = "";
      setTimeout(() => document.querySelector("#dialog")?.remove(), 30);
    },
    { signal: listeners.signal },
  );
  return {
    target,
    run: () =>
      executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: "education.university.schoolName",
        expectedValue: "가상대학교",
        expectedCurrentValue: "",
      }),
  };
}

describe("a search whose query the page binds to the target", () => {
  it("accepts the typed value once it survives closing the search", async () => {
    const test = queryBoundSearch({ revertOnClose: false });
    expect(await test.run()).toMatchObject({
      status: "selected",
      effect: "value-observed",
    });
    expect(test.target.value).toBe("가상대학교");
    expect(document.querySelector("#dialog")).toBeNull();
  });

  it("fails when closing the search reverts the typed value", async () => {
    const test = queryBoundSearch({ revertOnClose: true });
    expect(await test.run()).toMatchObject({ status: "failed" });
    expect(test.target.value).toBe("");
  });
});

describe("which result failures defer to a mirrored query", () => {
  it.each([
    ["search_results_not_found", true],
    ["result_pending", true],
    ["result_activation_unsafe", true],
    ["multiple_matching_results", false],
    ["result_set_incomplete", false],
    ["search_query_conflict", false],
  ])("%s → %s", (reason, defers) => {
    expect(defersToReflectedQuery(reason)).toBe(defers);
  });
});
