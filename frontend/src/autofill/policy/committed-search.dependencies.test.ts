/**
 * CF-177 C10 (F11): a committed search records its tuple first and then waits
 * softly for the row details the site enables after the commit (major type,
 * category, day/night). Radio groups are waited for as a group. Details that
 * never enable leave the committed tuple written. Synthetic values only.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
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

const QUERY = "합성전공 가";
let info: {
  mock: { calls: unknown[][] };
  mockRestore(): void;
};
beforeEach(() => {
  takeSiteEnters();
  setAutofillDebugEnabled(true);
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
  setAutofillDebugEnabled(false);
  vi.useRealTimers();
  installExecutionPolicy(document);
});
const writeLines = () =>
  info.mock.calls
    .map((call: unknown[]) => call[0])
    .filter(
      (line: unknown): line is string =>
        typeof line === "string" &&
        line.startsWith("[CareerForm] skip stage=write "),
    );

type Dependency = "radio" | "select";
/** A search driver whose row details (radio group / select) start disabled. */
function mountDetails(
  kind: string,
  dependencies: readonly Dependency[],
  timeoutMs = 800,
) {
  mountSearch(kind, (section) => {
    const search = section.fields[0];
    search.search.timeoutMs = timeoutMs;
    search.driver = {
      stage: 1,
      timeoutMs,
      dependencies: dependencies.map((d) => `synthetic.detail.${d}`),
      settled: dependencies.map((d) => ({
        field: `synthetic.detail.${d}`,
        state: "enabled",
      })),
    };
    for (const d of dependencies)
      section.fields.push({
        name: `synthetic.detail.${d}`,
        rawName: `entry.${d}`,
        type: d,
        label: d === "radio" ? "합성 구분" : "합성 계열",
        binding: {
          type: "DIRECT",
          profileFieldKey: "education.university.attendanceType",
        },
        options: { 주간: "01", 야간: "02" },
      });
  });
  const row = document.querySelector("#synthetic-row")!;
  if (dependencies.includes("radio"))
    row.insertAdjacentHTML(
      "beforeend",
      `<label><input type="radio" name="entry.radio" value="01" disabled>주간</label><label><input type="radio" name="entry.radio" value="02" disabled>야간</label>`,
    );
  if (dependencies.includes("select"))
    row.insertAdjacentHTML(
      "beforeend",
      `<select name="entry.select" disabled><option value=""></option><option value="01">주간</option></select>`,
    );
}
const enable = (name: string) =>
  document
    .querySelectorAll<HTMLInputElement>(`[name="${name}"]`)
    .forEach((e) => (e.disabled = false));

async function run(onCommit: () => void) {
  const { handle, item } = searchItem(QUERY);
  const query = handle.elements[0];
  query.addEventListener(
    "keypress",
    onSiteEnter(() => showResults(query, [QUERY], onCommit)),
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
  return { result, codes, elapsed: Date.now() - started, handle, item };
}

it("waits for a dependent radio group the site enables after the commit", async () => {
  mountDetails("major", ["radio"]);
  let enabledAt = 0;
  const { result, elapsed } = await run(() =>
    setTimeout(() => {
      enable("entry.radio");
      enabledAt = Date.now();
    }, 300),
  );
  expect(result).toBe(true);
  expect(enabledAt).toBeGreaterThan(0);
  expect(elapsed).toBeGreaterThanOrEqual(280);
  expect(writeLines()).toEqual([]);
});

it("waits for the late radio group when the select is enabled at once", async () => {
  mountDetails("major", ["select", "radio"]);
  let radioEnabled = false;
  const { result, elapsed } = await run(() => {
    enable("entry.select");
    setTimeout(() => {
      enable("entry.radio");
      radioEnabled = true;
    }, 250);
  });
  expect(result).toBe(true);
  expect(radioEnabled).toBe(true);
  expect(elapsed).toBeGreaterThanOrEqual(230);
});

it("keeps the committed tuple when the details never enable and says so once", async () => {
  mountDetails("major", ["select", "radio"], 300);
  const { result, codes, handle, item } = await run(() => {});
  expect(result).toBe(true);
  expect(codes).toEqual([]);
  expect(widget().name.value).toBe(QUERY);
  expect(getWriteAdapter(document).verifyRetained?.(handle, item)).toBe(true);
  expect(
    await getWorkflowAdapter(document).settleStateDriver?.(
      document,
      handle,
      undefined,
      { item, signal: new AbortController().signal },
    ),
  ).toBe(true);
  const lines = writeLines();
  for (const line of lines) expectHarnessLine(line, [QUERY, "합성"]);
  expect(lines).toEqual([
    expect.stringMatching(
      / reason=disabled-timeout detail=committed-search-dependencies$/,
    ),
  ]);
});

it("treats a dependent control removed after the commit like a timeout", async () => {
  mountDetails("major", ["select"], 300);
  const { result } = await run(() =>
    document.querySelector('[name="entry.select"]')!.remove(),
  );
  expect(result).toBe(true);
  expect(writeLines()).toEqual([
    expect.stringMatching(/detail=committed-search-dependencies$/),
  ]);
});

it("still refuses a license whose registration number stays visible", async () => {
  mountSearch("license", (section) => {
    section.fields[0].search.timeoutMs = 200;
  });
  document
    .querySelector("#synthetic-row")!
    .insertAdjacentHTML(
      "beforeend",
      '<input type="text" name="entry.registNumber">',
    );
  const { handle, item } = searchItem(QUERY);
  const query = handle.elements[0];
  query.addEventListener(
    "keypress",
    onSiteEnter(() =>
      showResults(query, [QUERY], undefined, "123", {
        "data-privateinfo": "false",
      }),
    ),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
});
