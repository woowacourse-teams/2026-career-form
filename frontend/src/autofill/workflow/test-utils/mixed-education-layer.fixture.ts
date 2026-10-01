/**
 * De-identified fixture for a generic "mixed education repeat row" form whose
 * school name search opens a role-less same-document layer.
 *
 * Structure (neutral class names only, no company selectors):
 *   .edu-repeat > .edu-row > [kind select | .edu-branch[high] | .edu-branch[college]]
 *   .edu-branch > .field > label + .school-search >
 *     (readonly school input, hidden code input, opener button, .school-layer-area > .school-layer)
 *
 * Inline `on*` attributes are real handlers: Vitest's jsdom environment runs
 * with `runScripts: "dangerously"`, so attribute handlers execute. They run in
 * jsdom's inner VM global, which is not the `window` object seen by test code,
 * so functions assigned to test `window` are invisible to them. The fixture
 * therefore defines the synthetic handler functions on the Document object:
 * an inline handler's scope chain is element → form → document → global, so
 * bare identifier calls such as `onclick="selectFn(this, …)"` resolve like
 * site globals without evaluating any handler string in test code.
 *
 * jsdom queues same-document fragment navigation as a separate task, so a
 * result link click changes `location.hash` only after the click returns.
 *
 * Only synthetic placeholders (`<고등학교명>`, `<학교코드>`) are used.
 */

export const EDUCATION_KIND_OPTIONS = [
  { code: "01", label: "고등학교" },
  { code: "02", label: "전문대학" },
  { code: "03", label: "대학교" },
  { code: "04", label: "대학원(석사)" },
  { code: "05", label: "대학원(박사)" },
] as const;

export type EducationKindLabel =
  (typeof EDUCATION_KIND_OPTIONS)[number]["label"];
export type BranchName = "high" | "college";
export type BranchVisibility = BranchName | "none" | "both";

export type LayerResponseMode =
  /** Empty the list and fill it synchronously; hide the zero notice when items exist. */
  | "sync-replace"
  /** Empty the list synchronously, then append one item per timer task. */
  | "chunked-replace"
  /** Leave the list and zero notice untouched (no mutation). */
  | "zero-no-mutation"
  /** Append items without removing existing ones; hide the zero notice. */
  | "append-only"
  /** Replace items but keep the zero notice visible. */
  | "zero-notice-contradiction";

export interface LayerResult {
  readonly name: string;
  readonly code: string;
}

export interface MixedEducationRowOptions {
  /** Initial kind option label, or "" for the placeholder option. */
  readonly kind?: EducationKindLabel | "";
  /** Initial branch visibility. Defaults to the branch implied by `kind`. */
  readonly branch?: BranchVisibility;
  /** Values pre-filled into the high school branch (e.g. a previous entry). */
  readonly highSchoolName?: string;
  readonly highSchoolCode?: string;
}

export interface MixedEducationIdAnomalies {
  /** School name/code inputs share the same id in both branches. */
  readonly duplicateBranchIds?: boolean;
  /** Name-less layer query and manual inputs get `id="NaN"` in rows >= 1. */
  readonly nanIdsInNewRows?: boolean;
  /** School name label `for` is `…0<i>` while the input id is `…<i>` in rows >= 1. */
  readonly labelForMismatchInNewRows?: boolean;
}

export interface MixedEducationLayerFixtureOptions {
  readonly document?: Document;
  /** One entry per initial row. Defaults to a single empty row. */
  readonly rows?: readonly MixedEducationRowOptions[];
  readonly anomalies?: MixedEducationIdAnomalies;
  /** Results returned by every layer search. */
  readonly results?: readonly LayerResult[];
  /** When true, result link handlers `return false` so the hash does not change. */
  readonly preventDefault?: boolean;
  readonly responseMode?: LayerResponseMode;
  /** Delay between chunks in `chunked-replace` mode. */
  readonly chunkDelayMs?: number;
  /** Fragment href of every result link. */
  readonly resultHref?: string;
  /**
   * Wrap the section in an application form that also owns unrelated
   * controls, so every layer query and search button belongs to that form.
   */
  readonly applicationForm?: boolean;
  /** The layer search button handler also calls `form.requestSubmit()`. */
  readonly layerSearchSubmitsForm?: boolean;
  /**
   * Each branch carries its own kind select and first-row actions instead of
   * the row, so the hidden branch keeps a hidden copy of both.
   */
  readonly branchLocalControls?: boolean;
  /** Render the rows without a section, fieldset or group wrapper. */
  readonly withoutSection?: boolean;
}

export type FixtureEvent =
  | {
      readonly type: "kind-change";
      readonly row: number;
      readonly kind: string;
    }
  | {
      readonly type: "open" | "close" | "search" | "manual-toggle";
      readonly row: number;
      readonly branch: BranchName;
    }
  | {
      readonly type: "select";
      readonly row: number;
      readonly branch: BranchName;
      readonly name: string;
      readonly code: string;
      readonly manual: boolean;
    }
  | { readonly type: "add-row" | "reset" | "delete"; readonly row: number }
  | { readonly type: "form-submit"; readonly defaultPrevented: boolean };

export interface BranchHandle {
  readonly element: HTMLElement;
  readonly label: HTMLLabelElement;
  readonly searchGroup: HTMLElement;
  readonly schoolName: HTMLInputElement;
  readonly schoolCode: HTMLInputElement;
  readonly opener: HTMLButtonElement;
  readonly layer: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly queryInput: HTMLInputElement;
  readonly submit: HTMLButtonElement;
  readonly resultArea: HTMLElement;
  readonly zeroNotice: HTMLElement;
  readonly list: HTMLUListElement;
  readonly manualToggle: HTMLButtonElement;
  readonly manualInput: HTMLInputElement;
  readonly confirm: HTMLButtonElement;
}

export interface RowHandle {
  readonly element: HTMLElement;
  readonly kindSelect: HTMLSelectElement;
  branch(name: BranchName): BranchHandle;
}

export interface MixedEducationLayerFixture {
  readonly document: Document;
  readonly container: HTMLElement;
  readonly addRowButton: HTMLButtonElement;
  readonly resetButton: HTMLButtonElement;
  readonly events: readonly FixtureEvent[];
  rows(): HTMLElement[];
  row(index: number): RowHandle;
  setResponseMode(mode: LayerResponseMode): void;
  setResults(results: readonly LayerResult[]): void;
  cleanup(): void;
}

const G = {
  kind: "__cfMixedEduKindChange",
  open: "__cfMixedEduOpenLayer",
  close: "__cfMixedEduCloseLayer",
  search: "__cfMixedEduSearch",
  queryKey: "__cfMixedEduQueryKey",
  select: "__cfMixedEduSelect",
  manual: "__cfMixedEduToggleManual",
  add: "__cfMixedEduAddRow",
  reset: "__cfMixedEduReset",
  remove: "__cfMixedEduDeleteRow",
} as const;

interface FixtureState {
  readonly doc: Document;
  readonly container: HTMLElement;
  readonly anomalies: MixedEducationIdAnomalies;
  readonly preventDefault: boolean;
  readonly chunkDelayMs: number;
  readonly resultHref: string;
  readonly layerSearchSubmitsForm: boolean;
  readonly branchLocalControls: boolean;
  readonly events: FixtureEvent[];
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  responseMode: LayerResponseMode;
  results: readonly LayerResult[];
  dateCounter: number;
}

const states = new WeakMap<Element, FixtureState>();
const installedDocuments = new WeakSet<Document>();

const SAFE_LITERAL = /^[^'"\\\r\n]*$/;

function assertSafeLiteral(value: string): void {
  if (!SAFE_LITERAL.test(value))
    throw new Error(
      "Fixture literals must not contain quotes, backslashes or newlines",
    );
}

type Attrs = Record<string, string | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs))
    if (value !== undefined) element.setAttribute(name, value);
  for (const child of children)
    element.append(
      typeof child === "string" ? doc.createTextNode(child) : child,
    );
  return element;
}

function show(element: HTMLElement, visible: boolean): void {
  element.style.display = visible ? "" : "none";
}

function branchForKind(kind: string): BranchName {
  return kind === "" || kind === "고등학교" ? "high" : "college";
}

function kindText(select: HTMLSelectElement): string {
  const option = select.selectedOptions[0];
  return option && option.value !== "" ? (option.textContent ?? "").trim() : "";
}

function stateOf(element: Element): FixtureState {
  const container = element.closest(".edu-repeat");
  const state = container && states.get(container);
  if (!state)
    throw new Error("Fixture element is not attached to a live fixture");
  return state;
}

function rowsOf(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(":scope > .edu-row"),
  );
}

function rowIndexOf(element: Element): number {
  const row = element.closest<HTMLElement>(".edu-row")!;
  return rowsOf(row.parentElement!).indexOf(row);
}

function branchNameOf(element: Element): BranchName {
  return element.closest<HTMLElement>(".edu-branch")!.dataset
    .branch as BranchName;
}

function applyBranchVisibility(
  row: HTMLElement,
  visibility: BranchVisibility,
): void {
  for (const branch of row.querySelectorAll<HTMLElement>(
    ":scope > .edu-branch",
  )) {
    const name = branch.dataset.branch as BranchName;
    show(branch, visibility === "both" || visibility === name);
  }
}

function kindValue(kind: string): string {
  const option = EDUCATION_KIND_OPTIONS.find(
    (candidate) => candidate.label === kind,
  );
  return option ? `${option.code}|${option.label}` : "";
}

function buildKindSelect(
  doc: Document,
  index: number,
  kind: string,
): HTMLSelectElement {
  const select = el(doc, "select", {
    name: "eduKind",
    id: `eduKind${index}`,
    onchange: `${G.kind}(this);`,
  });
  select.append(el(doc, "option", { value: "" }, ["구분"]));
  for (const option of EDUCATION_KIND_OPTIONS)
    select.append(
      el(doc, "option", { value: `${option.code}|${option.label}` }, [
        option.label,
      ]),
    );
  select.value = kindValue(kind);
  return select;
}

function buildLayer(
  doc: Document,
  state: FixtureState,
  index: number,
  branch: BranchName,
): HTMLElement {
  const nan = Boolean(state.anomalies.nanIdsInNewRows) && index >= 1;
  const layer = el(doc, "div", { class: "school-layer" }, [
    el(doc, "h4", {}, ["학교명 조회"]),
    el(
      doc,
      "button",
      {
        type: "button",
        class: "school-layer-close",
        onclick: `${G.close}(this);`,
      },
      ["닫기"],
    ),
    el(doc, "p", { class: "school-layer-guide" }, [
      "학교명을 입력한 뒤 검색 버튼을 누르세요.",
    ]),
    el(doc, "div", { class: "school-layer-query" }, [
      el(doc, "input", {
        type: "text",
        class: "school-layer-input",
        id: nan ? "NaN" : `${branch}Query${index}`,
        onkeydown: `if (event.key === 'Enter') { ${G.queryKey}(this); return false; }`,
      }),
      el(
        doc,
        "button",
        {
          type: "button",
          class: "school-layer-submit",
          onclick: `${G.search}(this);`,
        },
        ["검색"],
      ),
    ]),
    el(doc, "div", { class: "school-layer-results" }, [
      el(doc, "p", { class: "school-layer-empty" }, [
        "조회된 결과가 없습니다.",
      ]),
      el(doc, "ul", { class: "school-layer-list" }),
    ]),
    el(doc, "div", { class: "school-layer-manual" }, [
      el(
        doc,
        "button",
        {
          type: "button",
          class: "school-layer-manual-toggle",
          onclick: `${G.manual}(this);`,
        },
        ["직접입력"],
      ),
      el(doc, "input", {
        type: "text",
        class: "school-layer-manual-input",
        id: nan ? "NaN" : `${branch}Manual${index}`,
      }),
    ]),
    el(
      doc,
      "button",
      {
        type: "button",
        class: "school-layer-confirm",
        onclick: `${G.select}(this,'','');`,
      },
      ["확인"],
    ),
  ]);
  show(layer, false);
  show(layer.querySelector<HTMLElement>(".school-layer-manual-input")!, false);
  return layer;
}

function field(
  doc: Document,
  labelText: string,
  control: HTMLElement,
): HTMLElement {
  return el(doc, "div", { class: "field" }, [
    el(doc, "label", { for: control.id }, [labelText]),
    control,
  ]);
}

function dateInput(
  doc: Document,
  state: FixtureState,
  name: string,
): HTMLInputElement {
  return el(doc, "input", {
    type: "text",
    name,
    id: `dp${state.dateCounter++}`,
  });
}

function selectOf(
  doc: Document,
  name: string,
  id: string,
  options: readonly string[],
): HTMLSelectElement {
  return el(doc, "select", { name, id }, [
    el(doc, "option", { value: "" }, ["선택"]),
    ...options.map((option) => el(doc, "option", { value: option }, [option])),
  ]);
}

function buildBranch(
  doc: Document,
  state: FixtureState,
  index: number,
  branch: BranchName,
): HTMLElement {
  const duplicate = Boolean(state.anomalies.duplicateBranchIds);
  const prefix = branch === "high" || duplicate ? "school" : "collegeSchool";
  const nameId = `${prefix}Name${index}`;
  const labelFor =
    state.anomalies.labelForMismatchInNewRows && index >= 1
      ? `${prefix}Name0${index}`
      : nameId;
  const searchGroup = el(doc, "div", { class: "school-search" }, [
    el(doc, "input", {
      type: "text",
      readonly: "",
      class: "school-name",
      name: `${branch}SchoolName`,
      id: nameId,
    }),
    el(doc, "input", {
      type: "hidden",
      class: "school-code",
      name: `${branch}SchoolCode`,
      id: `${prefix}Code${index}`,
    }),
    el(
      doc,
      "button",
      { type: "button", class: "school-open", onclick: `${G.open}(this);` },
      ["검색"],
    ),
    el(doc, "div", { class: "school-layer-area" }, [
      buildLayer(doc, state, index, branch),
    ]),
  ]);
  const element = el(
    doc,
    "div",
    { class: "edu-branch", "data-branch": branch },
    [
      el(doc, "div", { class: "field" }, [
        el(doc, "label", { for: labelFor }, ["학교명"]),
        searchGroup,
      ]),
      field(doc, "입학년월", dateInput(doc, state, `${branch}Entrance`)),
      field(doc, "졸업년월", dateInput(doc, state, `${branch}Graduation`)),
    ],
  );
  if (branch === "college") {
    element.append(
      field(
        doc,
        "전공",
        el(doc, "input", { type: "text", name: "major", id: `major${index}` }),
      ),
      field(
        doc,
        "부전공",
        el(doc, "input", { type: "text", name: "minor", id: `minor${index}` }),
      ),
      field(
        doc,
        "평점",
        el(doc, "input", { type: "text", name: "gpa", id: `gpa${index}` }),
      ),
      field(
        doc,
        "기준학점",
        selectOf(doc, "gpaScale", `gpaScale${index}`, [
          "4.5",
          "4.3",
          "4.0",
          "100",
        ]),
      ),
      field(
        doc,
        "졸업구분",
        selectOf(doc, "graduationStatus", `graduationStatus${index}`, [
          "졸업",
          "졸업예정",
          "재학",
          "중퇴",
        ]),
      ),
    );
  }
  return element;
}

function buildRow(
  doc: Document,
  state: FixtureState,
  index: number,
  options: MixedEducationRowOptions,
): HTMLElement {
  const kind = options.kind ?? "";
  const row = el(
    doc,
    "div",
    { class: "edu-row" },
    state.branchLocalControls
      ? [
          buildBranch(doc, state, index, "high"),
          buildBranch(doc, state, index, "college"),
        ]
      : [
          buildKindSelect(doc, index, kind),
          buildBranch(doc, state, index, "high"),
          buildBranch(doc, state, index, "college"),
        ],
  );
  if (state.branchLocalControls)
    for (const branch of row.querySelectorAll<HTMLElement>(
      ":scope > .edu-branch",
    )) {
      branch.prepend(buildKindSelect(doc, index, kind));
      if (index === 0) branch.append(rowActions(doc, index));
    }
  if (!state.branchLocalControls || index > 0)
    row.append(rowActions(doc, index));
  applyBranchVisibility(row, options.branch ?? branchForKind(kind));
  const high = row.querySelector<HTMLElement>(
    '.edu-branch[data-branch="high"]',
  )!;
  if (options.highSchoolName !== undefined)
    high.querySelector<HTMLInputElement>(".school-name")!.value =
      options.highSchoolName;
  if (options.highSchoolCode !== undefined)
    high.querySelector<HTMLInputElement>(".school-code")!.value =
      options.highSchoolCode;
  return row;
}

function rowActions(doc: Document, index: number): HTMLElement {
  const actions =
    index === 0
      ? [
          el(
            doc,
            "button",
            {
              type: "button",
              class: "edu-row-add",
              onclick: `${G.add}(this);`,
            },
            ["내용추가"],
          ),
          el(
            doc,
            "button",
            {
              type: "button",
              class: "edu-row-reset",
              onclick: `${G.reset}(this);`,
            },
            ["초기화"],
          ),
        ]
      : [
          el(
            doc,
            "button",
            {
              type: "button",
              class: "edu-row-delete",
              onclick: `${G.remove}(this);`,
            },
            ["삭제"],
          ),
        ];
  return el(doc, "div", { class: "edu-row-actions" }, actions);
}

function resultItem(
  doc: Document,
  state: FixtureState,
  result: LayerResult,
): HTMLLIElement {
  const suffix = state.preventDefault ? " return false;" : "";
  return el(doc, "li", {}, [
    el(
      doc,
      "a",
      {
        href: state.resultHref,
        onclick: `${G.select}(this, '${result.code}', '${result.name}');${suffix}`,
      },
      [result.name],
    ),
  ]);
}

function runSearch(trigger: Element): void {
  const state = stateOf(trigger);
  const layer = trigger.closest<HTMLElement>(".school-layer")!;
  state.events.push({
    type: "search",
    row: rowIndexOf(layer),
    branch: branchNameOf(layer),
  });
  const list = layer.querySelector<HTMLUListElement>(".school-layer-list")!;
  const notice = layer.querySelector<HTMLElement>(".school-layer-empty")!;
  const items = () =>
    state.results.map((result) => resultItem(state.doc, state, result));
  switch (state.responseMode) {
    case "sync-replace":
      list.replaceChildren(...items());
      show(notice, state.results.length === 0);
      return;
    case "zero-notice-contradiction":
      list.replaceChildren(...items());
      show(notice, true);
      return;
    case "append-only":
      list.append(...items());
      show(notice, false);
      return;
    case "zero-no-mutation":
      return;
    case "chunked-replace": {
      list.replaceChildren();
      const pending = items();
      if (pending.length === 0) show(notice, true);
      pending.forEach((item, position) => {
        const timer = setTimeout(
          () => {
            state.timers.delete(timer);
            if (!list.isConnected) return;
            list.append(item);
            show(notice, false);
          },
          state.chunkDelayMs * (position + 1),
        );
        state.timers.add(timer);
      });
      return;
    }
  }
}

function installGlobals(doc: Document): void {
  if (installedDocuments.has(doc)) return;
  installedDocuments.add(doc);
  const globals = doc as unknown as Record<string, unknown>;
  globals[G.kind] = (select: HTMLSelectElement) => {
    const state = stateOf(select);
    const kind = kindText(select);
    state.events.push({ type: "kind-change", row: rowIndexOf(select), kind });
    const row = select.closest<HTMLElement>(".edu-row")!;
    // Branch-local kind selects mirror the chosen kind like one control.
    for (const peer of kindSelectsOf(row)) peer.value = select.value;
    applyBranchVisibility(row, branchForKind(kind));
  };
  globals[G.open] = (button: HTMLElement) => {
    const state = stateOf(button);
    const layer = button
      .closest(".school-search")!
      .querySelector<HTMLElement>(".school-layer")!;
    state.events.push({
      type: "open",
      row: rowIndexOf(button),
      branch: branchNameOf(button),
    });
    show(layer, true);
  };
  globals[G.close] = (button: HTMLElement) => {
    const state = stateOf(button);
    state.events.push({
      type: "close",
      row: rowIndexOf(button),
      branch: branchNameOf(button),
    });
    show(button.closest<HTMLElement>(".school-layer")!, false);
  };
  globals[G.search] = (button: HTMLElement) => {
    if (stateOf(button).layerSearchSubmitsForm)
      button.closest("form")?.requestSubmit();
    runSearch(button);
  };
  globals[G.queryKey] = (input: HTMLElement) => runSearch(input);
  globals[G.manual] = (button: HTMLElement) => {
    const state = stateOf(button);
    state.events.push({
      type: "manual-toggle",
      row: rowIndexOf(button),
      branch: branchNameOf(button),
    });
    const input = button
      .closest(".school-layer")!
      .querySelector<HTMLElement>(".school-layer-manual-input")!;
    show(input, input.style.display === "none");
  };
  globals[G.select] = (element: HTMLElement, code: string, name: string) => {
    const state = stateOf(element);
    const layer = element.closest<HTMLElement>(".school-layer")!;
    const group = layer.closest(".school-search")!;
    const manual = code === "" && name === "";
    const value = manual
      ? layer.querySelector<HTMLInputElement>(".school-layer-manual-input")!
          .value
      : name;
    state.events.push({
      type: "select",
      row: rowIndexOf(layer),
      branch: branchNameOf(layer),
      name: value,
      code,
      manual,
    });
    group.querySelector<HTMLInputElement>(".school-name")!.value = value;
    group.querySelector<HTMLInputElement>(".school-code")!.value = code;
    show(layer, false);
  };
  globals[G.add] = (button: HTMLElement) => {
    const state = stateOf(button);
    const index = rowsOf(state.container).length;
    state.events.push({ type: "add-row", row: index });
    state.container.append(buildRow(state.doc, state, index, {}));
  };
  globals[G.reset] = (button: HTMLElement) => {
    const state = stateOf(button);
    const row = button.closest<HTMLElement>(".edu-row")!;
    state.events.push({ type: "reset", row: rowIndexOf(row) });
    for (const select of kindSelectsOf(row)) select.value = "";
    for (const input of row.querySelectorAll<HTMLInputElement>("input"))
      input.value = "";
    for (const select of row.querySelectorAll<HTMLSelectElement>(
      ".edu-branch select",
    ))
      select.value = "";
    applyBranchVisibility(row, "high");
  };
  globals[G.remove] = (button: HTMLElement) => {
    const state = stateOf(button);
    const row = button.closest<HTMLElement>(".edu-row")!;
    state.events.push({ type: "delete", row: rowIndexOf(row) });
    row.remove();
  };
}

function kindSelectsOf(row: HTMLElement): HTMLSelectElement[] {
  return Array.from(
    row.querySelectorAll<HTMLSelectElement>(
      ":scope > select, :scope > .edu-branch > select[name='eduKind']",
    ),
  );
}

function branchHandle(row: HTMLElement, name: BranchName): BranchHandle {
  const element = row.querySelector<HTMLElement>(
    `:scope > .edu-branch[data-branch="${name}"]`,
  )!;
  const q = <T extends Element>(selector: string) =>
    element.querySelector<T>(selector)!;
  return {
    element,
    label: q<HTMLLabelElement>(".field > label"),
    searchGroup: q<HTMLElement>(".school-search"),
    schoolName: q<HTMLInputElement>(".school-name"),
    schoolCode: q<HTMLInputElement>(".school-code"),
    opener: q<HTMLButtonElement>(".school-open"),
    layer: q<HTMLElement>(".school-layer"),
    closeButton: q<HTMLButtonElement>(".school-layer-close"),
    queryInput: q<HTMLInputElement>(".school-layer-input"),
    submit: q<HTMLButtonElement>(".school-layer-submit"),
    resultArea: q<HTMLElement>(".school-layer-results"),
    zeroNotice: q<HTMLElement>(".school-layer-empty"),
    list: q<HTMLUListElement>(".school-layer-list"),
    manualToggle: q<HTMLButtonElement>(".school-layer-manual-toggle"),
    manualInput: q<HTMLInputElement>(".school-layer-manual-input"),
    confirm: q<HTMLButtonElement>(".school-layer-confirm"),
  };
}

export const DEFAULT_LAYER_RESULTS: readonly LayerResult[] = [
  { name: "<고등학교명>", code: "<학교코드>" },
];

export function createMixedEducationLayerFixture(
  options: MixedEducationLayerFixtureOptions = {},
): MixedEducationLayerFixture {
  const doc = options.document ?? document;
  if (!doc.defaultView)
    throw new Error("Inline handlers need a document with a window");
  const results = options.results ?? DEFAULT_LAYER_RESULTS;
  for (const result of results) {
    assertSafeLiteral(result.name);
    assertSafeLiteral(result.code);
  }
  const resultHref = options.resultHref ?? "#n";
  assertSafeLiteral(resultHref);
  installGlobals(doc);

  const container = el(doc, "div", { class: "edu-repeat" });
  const state: FixtureState = {
    doc,
    container,
    anomalies: options.anomalies ?? {},
    preventDefault: options.preventDefault ?? false,
    chunkDelayMs: options.chunkDelayMs ?? 20,
    resultHref,
    events: [],
    timers: new Set(),
    responseMode: options.responseMode ?? "sync-replace",
    results,
    dateCounter: 0,
    layerSearchSubmitsForm: options.layerSearchSubmitsForm ?? false,
    branchLocalControls: options.branchLocalControls ?? false,
  };
  states.set(container, state);
  const rowOptions =
    options.rows && options.rows.length > 0 ? options.rows : [{}];
  rowOptions.forEach((row, index) =>
    container.append(buildRow(doc, state, index, row)),
  );
  const section = el(
    doc,
    options.withoutSection ? "div" : "section",
    { class: "edu-section" },
    [el(doc, "h3", {}, ["학력사항"]), container],
  );
  if (options.applicationForm) {
    const form = el(
      doc,
      "form",
      { class: "application-form", method: "post", action: "/apply/save" },
      [
        el(doc, "input", { type: "hidden", name: "applicationToken" }),
        field(
          doc,
          "자기소개",
          el(doc, "textarea", { name: "introduction", id: "introduction" }),
        ),
        section,
        el(doc, "button", { type: "submit" }, ["제출"]),
      ],
    );
    form.addEventListener("submit", (event) => {
      state.events.push({
        type: "form-submit",
        defaultPrevented: event.defaultPrevented,
      });
      // Never let jsdom attempt a real form navigation.
      event.preventDefault();
    });
    doc.body.append(form);
  } else {
    doc.body.append(section);
  }

  return {
    document: doc,
    container,
    addRowButton: container.querySelector<HTMLButtonElement>(".edu-row-add")!,
    resetButton: container.querySelector<HTMLButtonElement>(".edu-row-reset")!,
    events: state.events,
    rows: () => rowsOf(container),
    row(index) {
      const element = rowsOf(container)[index];
      if (!element) throw new Error(`Fixture row ${index} does not exist`);
      return {
        element,
        // The rendered branch's copy when kind selects are branch-local.
        kindSelect:
          kindSelectsOf(element).find(
            (select) =>
              (select.parentElement as HTMLElement).style.display !== "none",
          ) ?? kindSelectsOf(element)[0]!,
        branch: (name) => branchHandle(element, name),
      };
    },
    setResponseMode(mode) {
      state.responseMode = mode;
    },
    setResults(next) {
      for (const result of next) {
        assertSafeLiteral(result.name);
        assertSafeLiteral(result.code);
      }
      state.results = next;
    },
    cleanup() {
      for (const timer of state.timers) clearTimeout(timer);
      state.timers.clear();
      states.delete(container);
      (
        container.closest(".application-form") ??
        container.closest(".edu-section")
      )?.remove();
    },
  };
}
