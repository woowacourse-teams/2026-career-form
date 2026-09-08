import { afterEach, expect, it } from "vitest";

import { createStructuralSignature } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import {
  confirmSkAutocomplete,
  isSkAutocompleteBridgeReady,
  SK_AUTOCOMPLETE_TARGET_ATTRIBUTE,
} from "./autocomplete-bridge";
import {
  installSkAutocompleteMainBridge,
  type SkAutocompleteItem,
  type SkJQuery,
} from "./autocomplete-main";

const bridgeCleanups: Array<() => void> = [];

afterEach(() => {
  bridgeCleanups.splice(0).forEach((cleanup) => cleanup());
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
  return { input, removeBridge, searches: () => searches };
}

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
    const confirmation = confirmSkAutocomplete(
      document,
      fieldHandle(fixture.input),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
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
