/**
 * Bug condition exploration (Property 1, task 2): label-less select labels.
 *
 * These tests encode the expected behavior and are expected to FAIL on the
 * unfixed code, which falls back to the select's textContent (every option
 * text concatenated).
 *
 * The preservation section (Property 2, task 3) compares `labelOf` with the
 * pre-fix reference on explicitly labelled selects, non-select elements and
 * trusted id relations; it passes on the unfixed code.
 *
 * **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 3.14**
 */
import { afterEach, describe, expect, it } from "vitest";

import { createMixedEducationLayerFixture } from "../workflow/test-utils/mixed-education-layer.fixture";
import { referenceLabelOf } from "../workflow/test-utils/preservation-reference";
import {
  bool,
  forAllSeeded,
  int,
  pick,
  string,
} from "../workflow/test-utils/seeded-generators";
import { labelOf, metadata } from "./metadata";

const TEXT_ALPHABET = "가나다라마바사아자차카타파하ABCXYZabcxyz0123()";

interface SelectCase {
  readonly placeholder?: string;
  readonly options: readonly string[];
  readonly codedValues: boolean;
}

function buildSelect(input: SelectCase): HTMLSelectElement {
  const wrapper = document.createElement("div");
  const select = document.createElement("select");
  if (input.placeholder !== undefined) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = input.placeholder;
    select.append(placeholder);
  }
  input.options.forEach((text, index) => {
    const option = document.createElement("option");
    option.value = input.codedValues ? `0${index + 1}|${text}` : text;
    option.textContent = text;
    select.append(option);
  });
  // A sibling control keeps the unassociated-label path from applying.
  const sibling = document.createElement("input");
  sibling.type = "text";
  wrapper.append(select, sibling);
  document.body.append(wrapper);
  return select;
}

function generateCase(rng: () => number, withPlaceholder: boolean): SelectCase {
  return {
    ...(withPlaceholder
      ? { placeholder: string(rng, TEXT_ALPHABET, 1, 8) }
      : {}),
    options: Array.from({ length: int(rng, 1, 5) }, () =>
      string(rng, TEXT_ALPHABET, 1, 8),
    ),
    codedValues: bool(rng),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("label-less select label (bug condition)", () => {
  it("uses only the value='' placeholder option text for the mixed-row kind select", () => {
    const fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "고등학교" }, { kind: "대학교" }],
    });
    try {
      for (const index of [0, 1])
        expect(labelOf(fixture.row(index).kindSelect)).toBe("구분");
    } finally {
      fixture.cleanup();
    }
  });

  it("returns undefined for a label-less select without a placeholder option", () => {
    const select = buildSelect({ options: ["A", "B"], codedValues: false });
    expect(labelOf(select)).toBeUndefined();
  });

  it("property: placeholder text or undefined, never option texts", () => {
    forAllSeeded(
      "label-less select label",
      { runs: 50 },
      (rng) => generateCase(rng, bool(rng)),
      (input) => {
        document.body.replaceChildren();
        const select = buildSelect(input);
        const expected =
          input.placeholder === undefined
            ? undefined
            : metadata(input.placeholder);
        expect(labelOf(select)).toBe(expected);
      },
    );
  });
});

type LabelSource =
  | "aria-labelledby"
  | "aria-label"
  | "wrapping-label"
  | "label-for"
  | "placeholder"
  | "definition-list";

const LABEL_SOURCES: readonly LabelSource[] = [
  "aria-labelledby",
  "aria-label",
  "wrapping-label",
  "label-for",
  "placeholder",
  "definition-list",
];

interface LabelledCase {
  readonly tag: "select" | "input" | "textarea" | "button" | "div";
  readonly sources: readonly LabelSource[];
  readonly texts: Readonly<Record<LabelSource, string>>;
  readonly content: string;
  readonly withPlaceholderOption: boolean;
}

/** Builds one control with the chosen label evidence; every id is unique. */
function buildLabelled(input: LabelledCase, run: number): HTMLElement {
  const id = `control-${run}`;
  const control = document.createElement(input.tag);
  control.id = id;
  if (control instanceof HTMLSelectElement) {
    if (input.withPlaceholderOption) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "선택";
      control.append(placeholder);
    }
    const option = document.createElement("option");
    option.value = "01|가";
    option.textContent = input.content;
    control.append(option);
  } else if (!(control instanceof HTMLInputElement)) {
    control.textContent = input.content;
  }
  const has = (source: LabelSource) => input.sources.includes(source);
  if (has("aria-labelledby")) {
    const labelledBy = document.createElement("span");
    labelledBy.id = `${id}-labelled`;
    labelledBy.textContent = input.texts["aria-labelledby"];
    document.body.append(labelledBy);
    control.setAttribute("aria-labelledby", labelledBy.id);
  }
  if (has("aria-label"))
    control.setAttribute("aria-label", input.texts["aria-label"]);
  if (has("placeholder"))
    control.setAttribute("placeholder", input.texts.placeholder);

  let placed: HTMLElement = control;
  if (has("wrapping-label")) {
    const wrapping = document.createElement("label");
    wrapping.append(input.texts["wrapping-label"], control);
    placed = wrapping;
  }
  // A sibling control keeps the unassociated-label path out of every case.
  const sibling = document.createElement("input");
  sibling.type = "text";
  if (has("definition-list")) {
    const list = document.createElement("dl");
    const term = document.createElement("dt");
    term.textContent = input.texts["definition-list"];
    const definition = document.createElement("dd");
    definition.append(placed);
    list.append(term, definition);
    document.body.append(list, sibling);
  } else {
    const wrapper = document.createElement("div");
    wrapper.append(placed, sibling);
    document.body.append(wrapper);
  }
  if (has("label-for")) {
    const forLabel = document.createElement("label");
    forLabel.htmlFor = id;
    forLabel.textContent = input.texts["label-for"];
    document.body.append(forLabel);
  }
  return control;
}

function generateLabelled(rng: () => number): LabelledCase {
  const tag = pick(rng, [
    "select",
    "input",
    "textarea",
    "button",
    "div",
  ] as const);
  const sources = LABEL_SOURCES.filter(() => bool(rng, 0.4));
  // A select is outside the bug condition only with explicit label evidence.
  if (tag === "select" && sources.length === 0)
    sources.push(pick(rng, LABEL_SOURCES));
  const text = () => string(rng, TEXT_ALPHABET, 1, 8);
  return {
    tag,
    sources,
    texts: {
      "aria-labelledby": text(),
      "aria-label": text(),
      "wrapping-label": text(),
      "label-for": text(),
      placeholder: text(),
      "definition-list": text(),
    },
    content: bool(rng, 0.8) ? text() : "",
    withPlaceholderOption: bool(rng),
  };
}

describe("label preservation (Property 2, 3.1, 3.2, 3.14)", () => {
  it("keeps explicit label priority and the non-select textContent fallback", () => {
    let run = 0;
    forAllSeeded(
      "explicit label and non-select fallback",
      { runs: 100 },
      generateLabelled,
      (input) => {
        document.body.replaceChildren();
        const control = buildLabelled(input, run++);
        expect(labelOf(control)).toBe(referenceLabelOf(control));
      },
    );
  });

  it("keeps trusted id relations for label for and aria-labelledby", () => {
    document.body.innerHTML = `
      <span id="subject">학교명</span>
      <div><input id="by" type="text" aria-labelledby="subject"><input type="text"></div>
      <div><label for="linked">전공명</label><input id="linked" type="text"><input type="text"></div>
      <div><label for="picked">학력 구분</label><select id="picked"><option value="">선택</option><option>A</option></select><input type="text"></div>`;
    const byId = (id: string) => document.getElementById(id)!;
    expect(labelOf(byId("by"))).toBe("학교명");
    expect(labelOf(byId("linked"))).toBe("전공명");
    expect(labelOf(byId("picked"))).toBe("학력 구분");
    for (const id of ["by", "linked", "picked"])
      expect(labelOf(byId(id))).toBe(referenceLabelOf(byId(id)));
  });
});
