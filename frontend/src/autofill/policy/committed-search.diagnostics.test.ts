import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
import type { WriteFailureCode } from "../write/failure";
import {
  mountSearch,
  onSiteEnter,
  searchItem,
  showResults,
  takeSiteEnters,
  widget,
} from "./__fixtures__/hplace-mrs2-search.synthetic";

const QUERY = "합성검색학교";
const CANARIES = [QUERY, "합성", "가상"];
let info: {
  mock: { calls: unknown[][] };
  mockRestore(): void;
  mockClear(): void;
};
beforeEach(() => {
  takeSiteEnters();
  setAutofillDebugEnabled(true);
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  setAutofillDebugEnabled(false);
  installExecutionPolicy(document);
});
const skipLines = () =>
  info.mock.calls
    .map((call: unknown[]) => call[0])
    .filter(
      (line: unknown): line is string =>
        typeof line === "string" &&
        line.startsWith("[CareerForm] skip stage=write "),
    );
const timeout = (ms: number) => (section: any) => {
  section.fields[0].search.timeoutMs = ms;
};
async function run(
  kind: string,
  respond: (query: HTMLInputElement) => void,
  configure?: (section: any) => void,
  prepare?: (query: HTMLInputElement) => void,
) {
  mountSearch(kind, configure);
  const { handle, item } = searchItem(QUERY);
  const query = handle.elements[0] as HTMLInputElement;
  prepare?.(query);
  query.addEventListener(
    "keypress",
    onSiteEnter(() => respond(query)),
  );
  const codes: WriteFailureCode[] = [];
  const started = Date.now();
  const result = await getWorkflowAdapter(document).executeStateDriver?.(
    document,
    handle,
    item,
    new AbortController().signal,
    (code) => codes.push(code),
  );
  const elapsed = Date.now() - started;
  const lines = skipLines();
  for (const line of lines) expectHarnessLine(line, CANARIES);
  return { result, codes, elapsed, lines, query };
}
const resultsBox = (query: Element) =>
  query.closest("div.search")!.querySelector(".searchResult")!;

it("reports a rendered no-result box at once instead of waiting for the timeout", async () => {
  const { result, codes, elapsed, lines } = await run(
    "license",
    (query) => {
      resultsBox(query).innerHTML = '<div class="noResult"></div>';
    },
    timeout(2000),
  );
  expect(result).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(codes).toEqual(["SEARCH_NO_RESULTS"]);
  expect(elapsed).toBeLessThan(1000);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(
    /^\[CareerForm\] skip stage=write key=\S+ reason=result-not-unique detail=committed-search-results-0$/,
  );
});

it("reports an empty filtered result list as no results", async () => {
  const { result, codes, lines } = await run(
    "college",
    (query) => {
      resultsBox(query).innerHTML =
        '<div class="filterCode"></div><ul class="searchResultList"></ul>';
    },
    timeout(2000),
  );
  expect(result).toBe(false);
  expect(codes).toEqual(["SEARCH_NO_RESULTS"]);
  expect(lines).toEqual([
    expect.stringMatching(/detail=committed-search-results-0$/),
  ]);
});

it("reports a silent site as a search timeout", async () => {
  const { result, codes, lines } = await run("college", () => {});
  expect(result).toBe(false);
  expect(codes).toEqual(["SEARCH_TIMEOUT"]);
  expect(lines).toEqual([
    expect.stringMatching(
      / reason=no-response detail=committed-search-no-response$/,
    ),
  ]);
});

it("does not read a stale no-result box from an earlier search as a new answer", async () => {
  const { result, codes } = await run(
    "college",
    () => {},
    timeout(150),
    (q) => {
      resultsBox(q).innerHTML = '<div class="noResult"></div>';
    },
  );
  expect(result).toBe(false);
  expect(codes).toEqual(["SEARCH_TIMEOUT"]);
});

it.each([
  [["합성검색학교", "합성검색학교"], "SEARCH_AMBIGUOUS"],
  [["합성검색학교 부속"], "SEARCH_NO_EXACT_MATCH"],
] as const)("reports %j as %s", async (titles, code) => {
  const { result, codes, lines } = await run("college", (query) =>
    showResults(query, [...titles]),
  );
  expect(result).toBe(false);
  expect(codes).toEqual([code]);
  expect(lines).toEqual([
    expect.stringMatching(
      / reason=result-not-unique detail=committed-search-results-n$/,
    ),
  ]);
  expect(widget().name.value).toBe("");
});

it("names the rejected metadata key and value class only", async () => {
  const { result, codes, lines } = await run("license", (query) =>
    showResults(query, [QUERY], undefined, "123", {
      "data-privateinfo": "undefined",
    }),
  );
  expect(result).toBe(false);
  expect(codes).toEqual(["SEARCH_ACTIVATION_UNSAFE"]);
  expect(lines).toEqual([
    expect.stringMatching(
      / reason=option-mismatch detail=committed-search-metadata-registration-undefined$/,
    ),
  ]);
});

it("names an unregistered data attribute without its name or value", async () => {
  const { codes, lines } = await run("college", (query) =>
    showResults(query, [QUERY], undefined, "123", {
      "data-secret-flag": QUERY,
    }),
  );
  expect(codes).toEqual(["SEARCH_ACTIVATION_UNSAFE"]);
  expect(lines).toEqual([
    expect.stringMatching(/ detail=committed-search-metadata-extra-attribute$/),
  ]);
});

it("reports a click that commits a different tuple as a readback mismatch", async () => {
  const { result, codes, lines } = await run("college", (query) =>
    showResults(query, [QUERY], () => {
      widget().code.value = "999";
    }),
  );
  expect(result).toBe(false);
  expect(codes).toEqual(["SEARCH_UNCONFIRMED"]);
  expect(lines).toEqual([expect.stringMatching(/ reason=readback-mismatch /)]);
});

it("reports a click without effect and keeps the default failure code", async () => {
  const { result, codes, lines } = await run("college", (query) => {
    showResults(query, [QUERY]);
    for (const button of resultsBox(query).querySelectorAll("button"))
      button.replaceWith(button.cloneNode(true));
  });
  expect(result).toBe(false);
  expect(codes).toEqual([]);
  expect(lines).toEqual([
    expect.stringMatching(/ reason=result-click-no-effect /),
  ]);
});

it("reports a server-saved tuple equal to the profile as unverified selection", async () => {
  mountSearch("college");
  const w = widget();
  w.name.value = QUERY;
  w.code.value = "123";
  w.display.textContent = QUERY;
  const { handle, item } = searchItem(QUERY);
  const codes: WriteFailureCode[] = [];
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
      (code) => codes.push(code),
    ),
  ).toBe(false);
  expect(codes).toEqual(["SEARCH_SELECTION_UNVERIFIED"]);
  const lines = skipLines();
  for (const line of lines) expectHarnessLine(line, CANARIES);
  expect(lines).toEqual([expect.stringMatching(/ reason=existing-value /)]);
});

it("reports a hidden or readonly query as an unavailable field", async () => {
  for (const [shape, code] of [
    ["hidden", "FIELD_DISABLED"],
    ["readonly", "FIELD_READONLY"],
  ] as const) {
    info.mockClear();
    const { result, codes } = await run(
      "college",
      () => {},
      undefined,
      (q) => {
        if (shape === "hidden") q.hidden = true;
        else q.readOnly = true;
      },
    );
    expect(result).toBe(false);
    expect(codes).toEqual([code]);
  }
});
