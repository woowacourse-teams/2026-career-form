import { afterEach, expect, it, vi } from "vitest";

import { createStructuralSignature } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import {
  confirmSkAutocomplete,
  isSkAutocompleteBridgeReady,
  SK_AUTOCOMPLETE_REQUEST_EVENT,
  SK_AUTOCOMPLETE_RESPONSE_EVENT,
  SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
} from "./autocomplete-bridge";
import {
  installSkAutocompleteMainBridge,
  type SkAutocompleteItem,
  type SkJQuery,
} from "./autocomplete-main";
import { skWorkflowAdapter } from "./workflow";
import type { WriteFailureCode } from "../../write/failure";

import { CATALOG, CATALOG_VERSION } from "../../../profile/catalog";
import { approveCatalogMatch } from "../../profile/catalog-identity";
import { retainedCatalogSelection } from "../../profile/catalog-receipt";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { StateDriverContext } from "../workflow";

const bridgeCleanups: Array<() => void> = [];

function catalogContext(
  kind: "certificate" | "languageTest" | "university",
): StateDriverContext {
  const entry = CATALOG.find(
    (entry) =>
      entry.kind === kind &&
      (kind === "university" || entry.aliases.length > 0),
  )!;
  const profileFieldKey =
    kind === "certificate"
      ? "certifications.certificate.name"
      : kind === "languageTest"
        ? "languages.languageTest.testName"
        : "education.university.schoolName";
  const searchIdentity = {
    status: "selected" as const,
    catalogId: entry.id,
    displayName: entry.name,
    originalText: entry.name,
    catalogVersion: CATALOG_VERSION,
  };
  const approval = approveCatalogMatch(
    searchIdentity,
    profileFieldKey,
    entry.name,
  );
  if (approval.status !== "selected")
    throw new Error("fixture approval failed");
  return {
    item: {
      profileFieldKey,
      profileValue: entry.name,
      searchIdentity,
      catalogMatch: approval.match,
    } as ReviewPlanItem,
    signal: new AbortController().signal,
  };
}

afterEach(() => {
  bridgeCleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function fieldHandle(input: HTMLInputElement): FieldCandidateHandle {
  return {
    kind: "field",
    candidateId: `field-${input.name}`,
    candidate: {
      candidateId: `field-${input.name}`,
      element: "input",
      control: "text",
      visibility: "visible",
      domName: input.name,
    },
    elements: [input],
    optionElements: new Map(),
    sectionId: "section",
    itemId: "item",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
  };
}

function setupAutocomplete(options: {
  name: "eduEducationName" | "cerCertName" | "lngExamName";
  rowClass: string;
  query: string;
  items: SkAutocompleteItem[];
  scoreControl?: "input" | "select";
  leavesSearchPending?: boolean;
}) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/fixture",
  });
  const row = document.createElement("div");
  row.className = `form-item-group ${options.rowClass}`;
  const input = document.createElement("input");
  input.name = options.name;
  input.value = options.query;
  row.append(input);
  if (options.scoreControl) {
    const score = document.createElement(options.scoreControl);
    score.setAttribute(
      "name",
      options.scoreControl === "input" ? "lngExamScore" : "lngExamScoreSel",
    );
    row.append(score);
  }
  document.body.append(row);

  const menu = document.createElement("ul");
  menu.className = "ui-menu ui-autocomplete";
  const itemByElement = new WeakMap<Element, SkAutocompleteItem>();
  const dataByElement = new WeakMap<Element, Map<string, unknown>>();
  const instance: {
    menu: { element: { 0: HTMLElement; length: number } };
    selectedItem?: SkAutocompleteItem;
    term: string;
    pending: number;
  } = {
    menu: { element: { 0: menu, length: 1 } },
    term: options.query,
    pending: 0,
  };
  const inputData = new Map<string, unknown>([
    ["ui-autocomplete", instance],
    ["confirmed", false],
  ]);
  dataByElement.set(input, inputData);
  let searches = 0;
  for (const item of options.items) {
    const li = document.createElement("li");
    li.className = "ui-menu-item";
    const button = document.createElement("div");
    button.className = "ui-menu-item-wrapper";
    button.textContent = String(item.label ?? "");
    button.addEventListener("click", () => {
      input.value = String(item.value ?? "");
      inputData.set("confirmed", true);
      instance.selectedItem = item;
    });
    li.append(button);
    itemByElement.set(li, item);
    menu.append(li);
  }
  document.body.append(menu);

  const jquery: SkJQuery = (element) => ({
    data: (key) =>
      key === "ui-autocomplete-item"
        ? itemByElement.get(element)
        : dataByElement.get(element)?.get(key),
    autocomplete: (command, value) => {
      if (element !== input) return undefined;
      if (command === "search") {
        searches += 1;
        instance.term = value ?? "";
        instance.pending = options.leavesSearchPending ? 1 : 0;
        return undefined;
      }
      return instance;
    },
  });
  const removeBridge = installSkAutocompleteMainBridge(document, jquery);
  bridgeCleanups.push(removeBridge);
  return { input, menu, removeBridge, searches: () => searches };
}

it.each([
  { title: "completed empty results", items: [], want: "SEARCH_NO_RESULTS" },
  {
    title: "completed results with no exact match",
    items: [{ id: "1", label: "TOEIC Bridge", value: "TOEIC Bridge" }],
    want: "SEARCH_NO_EXACT_MATCH",
  },
  {
    title: "duplicate exact results",
    items: [
      { id: "1", label: "TOEIC", value: "TOEIC" },
      { id: "2", label: "TOEIC", value: "TOEIC" },
    ],
    want: "SEARCH_AMBIGUOUS",
  },
  {
    title: "an exact result with an invalid selection ID",
    items: [{ id: "0", label: "TOEIC", value: "TOEIC" }],
    want: "SEARCH_UNCONFIRMED",
  },
] as const)(
  "reports $title without selecting a result",
  async ({ items, want }) => {
    const fixture = setupAutocomplete({
      name: "lngExamName",
      rowClass: "langExam-Item",
      query: "TOEIC",
      items: [...items],
      scoreControl: "input",
    });
    const failures: WriteFailureCode[] = [];
    let selections = 0;
    fixture.menu.addEventListener("click", () => selections++);

    await expect(
      skWorkflowAdapter.settleStateDriver!(
        document,
        fieldHandle(fixture.input),
        (code) => failures.push(code),
      ),
    ).resolves.toBe(false);
    expect(failures).toEqual([want]);
    expect(selections).toBe(0);
    expect(fixture.input.value).toBe("TOEIC");
  },
);

it("reports an unfinished search as a timeout, not empty results", async () => {
  vi.useFakeTimers();
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "공개 자격증",
    items: [],
    leavesSearchPending: true,
  });
  const failures: WriteFailureCode[] = [];
  const confirmation = confirmSkAutocomplete(
    document,
    fieldHandle(fixture.input),
    (code) => failures.push(code),
  );
  await vi.advanceTimersByTimeAsync(2_500);

  await expect(confirmation).resolves.toBe(false);
  expect(failures).toEqual(["SEARCH_TIMEOUT"]);
  expect(fixture.input.value).toBe("공개 자격증");
});

it("does not call hidden search candidates an empty completed result", async () => {
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "공개 자격증",
    items: [{ label: "공개 자격증", value: "공개 자격증" }],
  });
  fixture.menu.firstElementChild!.setAttribute("hidden", "");
  const failures: WriteFailureCode[] = [];

  await expect(
    confirmSkAutocomplete(document, fieldHandle(fixture.input), (code) =>
      failures.push(code),
    ),
  ).resolves.toBe(false);
  expect(failures).toEqual(["SEARCH_UNCONFIRMED"]);
});

it("keeps a settled hidden empty menu unconfirmed without response-content evidence", async () => {
  vi.useFakeTimers();
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "공개 자격증",
    items: [],
  });
  fixture.menu.hidden = true;
  const failures: WriteFailureCode[] = [];
  const confirmation = confirmSkAutocomplete(
    document,
    fieldHandle(fixture.input),
    (code) => failures.push(code),
  );
  await vi.advanceTimersByTimeAsync(2_499);
  expect(failures).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);

  await expect(confirmation).resolves.toBe(false);
  expect(failures).toEqual(["SEARCH_UNCONFIRMED"]);
});

it("does not interpret malformed search candidate data as no exact match", async () => {
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "공개 자격증",
    items: [{}],
  });
  const failures: WriteFailureCode[] = [];

  await expect(
    confirmSkAutocomplete(document, fieldHandle(fixture.input), (code) =>
      failures.push(code),
    ),
  ).resolves.toBe(false);
  expect(failures).toEqual(["SEARCH_UNCONFIRMED"]);
});

it("reports the missing score control only after selecting the exact exam", async () => {
  vi.useFakeTimers();
  const fixture = setupAutocomplete({
    name: "lngExamName",
    rowClass: "langExam-Item",
    query: "TOEIC",
    items: [{ id: "1", label: "TOEIC", value: "TOEIC" }],
  });
  const failures: WriteFailureCode[] = [];
  let selections = 0;
  fixture.menu.addEventListener("click", () => selections++);
  const confirmation = confirmSkAutocomplete(
    document,
    fieldHandle(fixture.input),
    (code) => failures.push(code),
  );
  await vi.advanceTimersByTimeAsync(1_000);

  await expect(confirmation).resolves.toBe(false);
  expect(failures).toEqual(["EXAM_SCORE_NOT_READY"]);
  expect(selections).toBe(1);
});

it.each([
  ["field name", { fieldName: "eduEducationName" }],
  ["command", { command: "probe" }],
  ["request ID", { requestId: "another-request" }],
  ["marker", {}],
  ["status", { status: "confirmed" }],
  ["failure code", { failureCode: "PRIVATE_SITE_MESSAGE" }],
] as const)(
  "does not trust a response with an invalid %s",
  async (_name, override) => {
    vi.useFakeTimers();
    const fixture = setupAutocomplete({
      name: "cerCertName",
      rowClass: "cert-Item",
      query: "공개 자격증",
      items: [],
    });
    fixture.removeBridge();
    const respond = (event: Event) => {
      const request = JSON.parse((event as CustomEvent<string>).detail);
      if (_name === "marker")
        fixture.input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE);
      document.dispatchEvent(
        new CustomEvent(SK_AUTOCOMPLETE_RESPONSE_EVENT, {
          detail: JSON.stringify({
            ...request,
            status: "rejected",
            failureCode: "SEARCH_NO_RESULTS",
            ...override,
          }),
        }),
      );
    };
    document.addEventListener(SK_AUTOCOMPLETE_REQUEST_EVENT, respond);
    bridgeCleanups.push(() =>
      document.removeEventListener(SK_AUTOCOMPLETE_REQUEST_EVENT, respond),
    );
    const failures: WriteFailureCode[] = [];

    const confirmation = confirmSkAutocomplete(
      document,
      fieldHandle(fixture.input),
      (code) => failures.push(code),
    );
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(confirmation).resolves.toBe(false);
    expect(failures).not.toContain("SEARCH_NO_RESULTS");
    expect(failures).not.toContain("PRIVATE_SITE_MESSAGE");
  },
);

it("keeps rejected bridge diagnostics free of the searched profile value", async () => {
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "SYNTHETIC-PRIVATE-QUERY",
    items: [],
  });
  const responses: string[] = [];
  const collect = (event: Event) =>
    responses.push((event as CustomEvent<string>).detail);
  document.addEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, collect);
  bridgeCleanups.push(() =>
    document.removeEventListener(SK_AUTOCOMPLETE_RESPONSE_EVENT, collect),
  );

  await expect(
    confirmSkAutocomplete(document, fieldHandle(fixture.input)),
  ).resolves.toBe(false);
  expect(responses).toHaveLength(1);
  expect(JSON.parse(responses[0])).toMatchObject({
    status: "rejected",
    failureCode: "SEARCH_NO_RESULTS",
  });
  expect(responses[0]).not.toContain("SYNTHETIC-PRIVATE-QUERY");
});

it("reports a missing bridge response as a timeout", async () => {
  vi.useFakeTimers();
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: "공개 자격증",
    items: [],
  });
  fixture.removeBridge();
  const failures: WriteFailureCode[] = [];
  const confirmation = confirmSkAutocomplete(
    document,
    fieldHandle(fixture.input),
    (code) => failures.push(code),
  );
  await vi.advanceTimersByTimeAsync(4_000);

  await expect(confirmation).resolves.toBe(false);
  expect(failures).toEqual(["SEARCH_TIMEOUT"]);
});

it.each([
  [
    "the request marker is removed",
    (input: HTMLInputElement) =>
      input.removeAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE),
  ],
  [
    "the page changes the value",
    (input: HTMLInputElement) => {
      input.value = "User value";
    },
  ],
] as const)(
  "does not restore a search value when %s before a delayed confirmation settles",
  async (_description, interrupt) => {
    const fixture = setupAutocomplete({
      name: "eduEducationName",
      rowClass: "educationUniv-item",
      query: "Existing value",
      items: [],
      leavesSearchPending: true,
    });
    await expect(
      isSkAutocompleteBridgeReady(document, fieldHandle(fixture.input)),
    ).resolves.toBe(true);
    fixture.input.value = "Written query";
    const dispatched = new Promise<void>((resolve) =>
      document.addEventListener(
        SK_AUTOCOMPLETE_REQUEST_EVENT,
        () => resolve(),
        { once: true },
      ),
    );
    const confirmation = confirmSkAutocomplete(
      document,
      fieldHandle(fixture.input),
    );
    await dispatched;
    interrupt(fixture.input);

    await expect(confirmation).resolves.toBe(false);
    expect(fixture.input.value).toBe(
      _description === "the page changes the value"
        ? "User value"
        : "Written query",
    );
  },
);

it.each([
  ["eduEducationName", "educationUniv-item"],
  ["cerCertName", "cert-Item"],
] as const)(
  "confirms the unique exact registered %s result associated with its widget",
  async (name, rowClass) => {
    const fixture = setupAutocomplete({
      name,
      rowClass,
      query: "정확한 공개 항목",
      items: [
        {
          label: "정확한 공개 항목",
          value: "정확한 공개 항목",
        },
      ],
    });

    await expect(
      isSkAutocompleteBridgeReady(document, fieldHandle(fixture.input)),
    ).resolves.toBe(true);
    await expect(
      confirmSkAutocomplete(document, fieldHandle(fixture.input)),
    ).resolves.toBe(true);
    expect(fixture.searches()).toBe(1);
    expect(fixture.input.value).toBe("정확한 공개 항목");
    fixture.removeBridge();
  },
);

it.each(["input", "select"] as const)(
  "confirms an exact exam result only after its %s score control is visible",
  async (scoreControl) => {
    const fixture = setupAutocomplete({
      name: "lngExamName",
      rowClass: "langExam-Item",
      query: "TOEIC",
      items: [{ id: "88", label: "TOEIC", value: "TOEIC" }],
      scoreControl,
    });

    await expect(
      confirmSkAutocomplete(document, fieldHandle(fixture.input)),
    ).resolves.toBe(true);
    fixture.removeBridge();
  },
);

it.each([
  {
    title: "the direct-input no-result item",
    items: [{ id: "0", label: "UNLISTED", value: "" }],
  },
  {
    title: "a partial result",
    items: [{ id: "1", label: "TOEIC Bridge", value: "TOEIC Bridge" }],
  },
  {
    title: "duplicate exact results",
    items: [
      { id: "1", label: "TOEIC", value: "TOEIC" },
      { id: "2", label: "TOEIC", value: "TOEIC" },
    ],
  },
])("rejects $title without confirming it", async ({ items }) => {
  const fixture = setupAutocomplete({
    name: "lngExamName",
    rowClass: "langExam-Item",
    query: items[0]?.id === "0" ? "UNLISTED" : "TOEIC",
    items,
    scoreControl: "input",
  });

  await expect(
    confirmSkAutocomplete(document, fieldHandle(fixture.input)),
  ).resolves.toBe(false);
  fixture.removeBridge();
});

it("rejects an allowlisted name outside its verified row without leaving a marker", async () => {
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "different-item",
    query: "정확한 공개 항목",
    items: [
      {
        label: "정확한 공개 항목",
        value: "정확한 공개 항목",
      },
    ],
  });

  await expect(
    confirmSkAutocomplete(document, fieldHandle(fixture.input)),
  ).resolves.toBe(false);
  expect(
    fixture.input.hasAttribute("data-career-form-sk-autocomplete-target"),
  ).toBe(false);
  fixture.removeBridge();
});

it.each(["certificate", "languageTest"] as const)(
  "approves %s aliases and retains the exact selected code",
  async (kind) => {
    const context = catalogContext(kind);
    const match = context.item.catalogMatch!;
    const label = match.labels.find((label) => label !== match.query)!;
    const fixture = setupAutocomplete({
      name: kind === "certificate" ? "cerCertName" : "lngExamName",
      rowClass: kind === "certificate" ? "cert-Item" : "langExam-Item",
      query: match.query,
      items: [{ id: "88", label, value: label }],
      scoreControl: "input",
    });
    expect(
      await skWorkflowAdapter.settleStateDriver!(
        document,
        fieldHandle(fixture.input),
        undefined,
        context,
      ),
    ).toBe(true);
    expect(retainedCatalogSelection(context.item, fixture.input)).toBe(label);
    fixture.input.value = match.query;
    expect(
      retainedCatalogSelection(context.item, fixture.input),
    ).toBeUndefined();
  },
);

it.each(["valid", "missing", "hidden", "shared", "mismatch"])(
  "requires exclusively owned visible school detail: %s",
  async (mode) => {
    const context = catalogContext("university");
    const match = context.item.catalogMatch!;
    const fixture = setupAutocomplete({
      name: "eduEducationName",
      rowClass: "educationUniv-item",
      query: match.query,
      items: [{ id: "88", label: match.query, value: match.query }],
    });
    const option = fixture.menu.firstElementChild!;
    if (mode !== "missing") {
      const detail = document.createElement("span");
      detail.id = "school-detail";
      detail.textContent =
        mode === "mismatch" ? "other campus" : match.requiredDetail!;
      detail.hidden = mode === "hidden";
      fixture.menu.append(detail);
      option.setAttribute("aria-describedby", detail.id);
      if (mode === "shared") {
        const other = document.createElement("li");
        other.setAttribute("aria-describedby", detail.id);
        fixture.menu.append(other);
      }
    }
    expect(
      await skWorkflowAdapter.settleStateDriver!(
        document,
        fieldHandle(fixture.input),
        undefined,
        context,
      ),
    ).toBe(mode === "valid");
  },
);

it.each([
  "stale",
  "wrongkind",
  "malformed",
  "duplicate",
  "protected",
  "cancelled",
])("rejects %s approval without selection", async (mode) => {
  const context = catalogContext("certificate");
  const match = context.item.catalogMatch!;
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: match.query,
    items: [
      { id: "1", label: match.query, value: match.query },
      ...(mode === "duplicate"
        ? [{ id: "2", label: match.query, value: match.query }]
        : []),
    ],
  });
  let clicks = 0;
  fixture.menu.addEventListener("click", () => clicks++);
  if (mode === "stale")
    context.item.searchIdentity = {
      ...context.item.searchIdentity!,
      catalogVersion: "old",
    } as typeof context.item.searchIdentity;
  if (mode === "wrongkind")
    context.item.catalogMatch = { ...match, kind: "languageTest" };
  if (mode === "malformed")
    context.item.catalogMatch = { ...match, labels: [] };
  if (mode === "protected") {
    expect(
      await skWorkflowAdapter.waitForStateDriverReady!(
        document,
        fieldHandle(fixture.input),
        undefined,
        context,
      ),
    ).toBe(false);
    return;
  }
  const actual =
    mode === "cancelled"
      ? { ...context, signal: AbortSignal.abort() }
      : context;
  expect(
    await skWorkflowAdapter.settleStateDriver!(
      document,
      fieldHandle(fixture.input),
      undefined,
      actual,
    ),
  ).toBe(false);
  expect(clicks).toBe(0);
  expect(fixture.input.hasAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE)).toBe(
    false,
  );
});

it("invalidates an in-flight request on cancellation before any late result can select", async () => {
  const context = catalogContext("certificate");
  const controller = new AbortController();
  const fixture = setupAutocomplete({
    name: "cerCertName",
    rowClass: "cert-Item",
    query: context.item.catalogMatch!.query,
    items: [],
    leavesSearchPending: true,
  });
  const dispatched = new Promise<void>((resolve) =>
    document.addEventListener(SK_AUTOCOMPLETE_REQUEST_EVENT, () => resolve(), {
      once: true,
    }),
  );
  const confirmation = skWorkflowAdapter.settleStateDriver!(
    document,
    fieldHandle(fixture.input),
    undefined,
    { ...context, signal: controller.signal },
  );
  await dispatched;
  controller.abort();
  expect(await confirmation).toBe(false);
  expect(fixture.input.hasAttribute(SK_AUTOCOMPLETE_TARGET_ATTRIBUTE)).toBe(
    false,
  );
  expect(fixture.input.value).toBe(context.item.catalogMatch!.query);
});

it.each(["rejected", "stale"])(
  "rechecks the live profile before dispatch: %s",
  async (mode) => {
    const context = catalogContext("certificate");
    const query = context.item.catalogMatch!.query;
    const fixture = setupAutocomplete({
      name: "cerCertName",
      rowClass: "cert-Item",
      query,
      items: [{ id: "88", label: query, value: query }],
    });
    expect(
      await skWorkflowAdapter.settleStateDriver!(
        document,
        fieldHandle(fixture.input),
        undefined,
        {
          ...context,
          beforeMutation: async () => {
            if (mode === "stale")
              context.item.searchIdentity = {
                ...context.item.searchIdentity!,
                catalogVersion: "old",
              } as typeof context.item.searchIdentity;
            return mode !== "rejected";
          },
        },
      ),
    ).toBe(false);
    expect(fixture.searches()).toBe(0);
  },
);

it.each(["wrongkind", "malformed", "oversized"])(
  "MAIN rejects unapproved wire match: %s",
  (mode) => {
    const context = catalogContext("certificate");
    const match = context.item.catalogMatch!;
    const fixture = setupAutocomplete({
      name: "cerCertName",
      rowClass: "cert-Item",
      query: match.query,
      items: [{ id: "88", label: match.query, value: match.query }],
    });
    fixture.input.setAttribute(
      SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
      "wire-request",
    );
    const catalogMatch =
      mode === "wrongkind"
        ? { ...match, kind: "languageTest" }
        : mode === "malformed"
          ? { ...match, labels: [] }
          : { ...match, query: "x".repeat(513) };
    document.dispatchEvent(
      new CustomEvent(SK_AUTOCOMPLETE_REQUEST_EVENT, {
        detail: JSON.stringify({
          requestId: "wire-request",
          command: "confirm",
          fieldName: "cerCertName",
          catalogMatch,
        }),
      }),
    );
    expect(fixture.searches()).toBe(0);
  },
);
