import type { Profile, ProfileEntry } from "../../../profile/model";

const EDUCATION_OPTIONS = [
  { label: "고등학교", code: "3" },
  { label: "전문대학", code: "4" },
  { label: "학사", code: "5" },
  { label: "석사", code: "6" },
  { label: "박사", code: "7" },
] as const;

const WAIT_TIMEOUT_MILLISECONDS = 3_000;
const EDUCATION_KIND_LIMITS: Readonly<Record<string, number>> = {
  "3": 1,
  "4": 2,
  "5": 2,
  "6": 2,
  "7": 2,
};

type EducationKind = (typeof EDUCATION_OPTIONS)[number];

interface EducationRow {
  element: HTMLElement;
  hidden: HTMLInputElement;
  trigger: HTMLInputElement;
  selectWrap: HTMLElement;
  index: number;
}

interface ProtectedOriginalRow {
  kind: EducationKind;
  valueSignature: string;
}

function profileKinds(profile: Profile): EducationKind[] | undefined {
  const validSections = new Set(["highSchool", "university", "graduateSchool"]);
  if (profile.education.some((entry) => !validSections.has(entry.sectionId))) {
    return undefined;
  }
  const highSchools = entriesFor(
    profile.education,
    "highSchool",
    () => EDUCATION_OPTIONS[0],
  );
  const universities = entriesFor(
    profile.education,
    "university",
    universityKind,
  );
  const graduateSchools = entriesFor(
    profile.education,
    "graduateSchool",
    graduateKind,
  );
  if (!highSchools || !universities || !graduateSchools) return undefined;
  const kinds = [...highSchools, ...universities, ...graduateSchools];
  return kinds.every(
    (kind) =>
      kinds.filter((candidate) => candidate.code === kind.code).length <=
      EDUCATION_KIND_LIMITS[kind.code],
  )
    ? kinds
    : undefined;
}

function entriesFor(
  entries: readonly ProfileEntry[],
  sectionId: string,
  kindForEntry: (entry: ProfileEntry) => EducationKind | undefined,
): EducationKind[] | undefined {
  const kinds: EducationKind[] = [];
  for (const entry of entries) {
    if (entry.sectionId !== sectionId) continue;
    const kind = kindForEntry(entry);
    if (!kind) return undefined;
    kinds.push(kind);
  }
  return kinds;
}

function universityKind(entry: ProfileEntry): EducationKind | undefined {
  switch (entry.values.degreeLevel) {
    case "전문학사":
      return EDUCATION_OPTIONS[1];
    case "학사":
      return EDUCATION_OPTIONS[2];
    default:
      return undefined;
  }
}

function graduateKind(entry: ProfileEntry): EducationKind | undefined {
  switch (entry.values.degreeLevel) {
    case "석사":
      return EDUCATION_OPTIONS[3];
    case "박사":
      return EDUCATION_OPTIONS[4];
    default:
      return undefined;
  }
}

function directRows(article: HTMLElement): HTMLElement[] {
  return Array.from(article.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains("field-content"),
  );
}

function educationRow(element: HTMLElement): EducationRow | undefined {
  const groups = Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains("field-group"),
  );
  if (groups.length !== 1) return undefined;
  const wraps = Array.from(
    groups[0]!.querySelectorAll<HTMLElement>(":scope > .field > .select-wrap"),
  ).filter((wrap) => {
    const hidden = wrap.querySelectorAll<HTMLInputElement>(
      ":scope > input[type='hidden'].js-field[name='schGb']",
    );
    const trigger = wrap.querySelectorAll<HTMLInputElement>(
      ":scope > input[type='button'].btn-select[id^='schGb_']",
    );
    return hidden.length === 1 && trigger.length === 1;
  });
  if (wraps.length !== 1) return undefined;
  const selectWrap = wraps[0]!;
  const hidden = selectWrap.querySelector<HTMLInputElement>(
    ":scope > input[type='hidden'].js-field[name='schGb']",
  );
  const trigger = selectWrap.querySelector<HTMLInputElement>(
    ":scope > input[type='button'].btn-select[id^='schGb_']",
  );
  const match = trigger?.id.match(/^schGb_([1-9][0-9]*)$/);
  if (!hidden || !trigger || !match) return undefined;
  return { element, hidden, trigger, selectWrap, index: Number(match[1]) };
}

function optionIsExact(
  option: HTMLButtonElement,
  expected: EducationKind,
): boolean {
  return (
    option.dataset.code === expected.code &&
    option.textContent?.trim() === expected.label
  );
}

function optionsAreComplete(row: EducationRow): boolean {
  const choices = Array.from(
    row.selectWrap.querySelectorAll<HTMLButtonElement>(
      ":scope > .select-option.education-option > button[data-code]",
    ),
  );
  const resetChoices = choices.filter(
    (choice) =>
      choice.dataset.code === "" &&
      choice.classList.contains("btn-option-reset") &&
      choice.textContent?.trim() === "선택하세요.",
  );
  const educationChoices = choices.filter(
    (choice) => choice.dataset.code !== "",
  );
  return (
    choices.length === EDUCATION_OPTIONS.length + 1 &&
    resetChoices.length === 1 &&
    educationChoices.length === EDUCATION_OPTIONS.length &&
    EDUCATION_OPTIONS.every(
      (expected) =>
        educationChoices.filter((choice) => optionIsExact(choice, expected))
          .length === 1,
    )
  );
}

function rowHasUserValue(row: EducationRow): boolean {
  return Array.from(
    row.element.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select"),
  ).some((field) => {
    if (field === row.hidden || field === row.trigger) return false;
    if (!(field instanceof HTMLInputElement)) {
      return field.value.trim().length > 0;
    }
    if (field.type === "hidden" || field.type === "button") return false;
    if (field.type === "checkbox" || field.type === "radio") {
      return field.checked;
    }
    if (field.type === "file") return field.files?.length !== 0;
    return field.value.trim().length > 0;
  });
}

function rowValueSignature(row: EducationRow): string {
  return Array.from(
    row.element.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select"),
    (field) =>
      [
        field.tagName,
        field.type,
        field.id,
        field.name,
        field.value,
        field instanceof HTMLInputElement &&
        (field.type === "checkbox" || field.type === "radio")
          ? String(field.checked)
          : "",
      ].join("\u0000"),
  ).join("\u0001");
}

function selectionMatches(row: EducationRow, expected: EducationKind): boolean {
  return (
    row.hidden.value === expected.code &&
    row.trigger.value.trim() === expected.label
  );
}

function isEmptyRow(row: EducationRow): boolean {
  return (
    row.hidden.value.trim() === "" &&
    (row.trigger.value.trim() === "" ||
      row.trigger.value.trim() === "선택하세요." ||
      row.trigger.value.trim() === "선택하세요") &&
    !rowHasUserValue(row)
  );
}

function isVisibleEnabled(element: HTMLElement): boolean {
  return (
    element.isConnected &&
    !element.matches(":disabled") &&
    !element.closest("[hidden], [aria-hidden='true'], [inert], .none") &&
    (() => {
      const view = element.ownerDocument.defaultView;
      if (!view) return false;
      for (
        let current: HTMLElement | null = element;
        current;
        current = current.parentElement
      ) {
        const style = view.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
      }
      return true;
    })()
  );
}

function isVisibleControl(control: HTMLInputElement): boolean {
  return !control.disabled && isVisibleEnabled(control);
}

function isVisibleEnabledOption(option: HTMLButtonElement): boolean {
  return !option.disabled && isVisibleEnabled(option);
}

function hasRevealedEducationFields(row: EducationRow): boolean {
  const selectors = [
    `input#schNm_${row.index}[name='schNm'][type='text']`,
    `input#whiStDt_${row.index}[type='text'][maxlength='7']`,
    `input#whiEndDt_${row.index}[type='text'][maxlength='7']`,
  ];
  return selectors.every((selector) => {
    const controls = Array.from(
      row.element.querySelectorAll<HTMLInputElement>(
        `.js-education ${selector}`,
      ),
    );
    return controls.length === 1 && isVisibleControl(controls[0]!);
  });
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function waitFor(
  document: Document,
  condition: () => boolean,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signalAborted(signal)) return Promise.resolve(false);
  if (condition()) return Promise.resolve(true);
  const view = document.defaultView;
  if (!view || !document.documentElement) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      observer.disconnect();
      view.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => finish(false);
    const observer = new view.MutationObserver(() => {
      if (signalAborted(signal)) return finish(false);
      if (condition()) finish(true);
    });
    const timeout = view.setTimeout(
      () => finish(!signalAborted(signal) && condition()),
      WAIT_TIMEOUT_MILLISECONDS,
    );
    signal?.addEventListener("abort", abort, { once: true });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled", "hidden", "maxlength", "value"],
    });
  });
}

function currentRows(article: HTMLElement): EducationRow[] | undefined {
  const rows = directRows(article).map(educationRow);
  return rows.every((row): row is EducationRow => row !== undefined)
    ? rows
    : undefined;
}

function isStable(
  article: HTMLElement,
  originalRows: readonly HTMLElement[],
  selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
  expectedLength: number,
): boolean {
  if (!article.isConnected) return false;
  const rows = currentRows(article);
  if (!rows || rows.length !== expectedLength) return false;
  if (
    !originalRows.every((element, index) => rows[index]?.element === element)
  ) {
    return false;
  }
  return Array.from(selectedOriginalRows).every(([element, protectedRow]) => {
    const row = rows.find((candidate) => candidate.element === element);
    return (
      row !== undefined &&
      selectionMatches(row, protectedRow.kind) &&
      rowValueSignature(row) === protectedRow.valueSignature
    );
  });
}

async function selectKind(
  document: Document,
  article: HTMLElement,
  row: EducationRow,
  expected: EducationKind,
  originalRows: readonly HTMLElement[],
  selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
  expectedLength: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (
    signalAborted(signal) ||
    !isStable(article, originalRows, selectedOriginalRows, expectedLength) ||
    !isVisibleControl(row.trigger) ||
    !isEmptyRow(row) ||
    !optionsAreComplete(row)
  ) {
    return false;
  }
  row.trigger.click();
  if (
    signalAborted(signal) ||
    !row.trigger.isConnected ||
    !optionsAreComplete(row)
  ) {
    return false;
  }
  const choices = Array.from(
    row.selectWrap.querySelectorAll<HTMLButtonElement>(
      ":scope > .select-option.education-option > button[data-code]",
    ),
  ).filter((choice) => optionIsExact(choice, expected));
  if (choices.length !== 1 || !isVisibleEnabledOption(choices[0]!)) {
    return false;
  }
  choices[0]!.click();
  return waitFor(
    document,
    () =>
      !signalAborted(signal) &&
      isStable(article, originalRows, selectedOriginalRows, expectedLength) &&
      selectionMatches(row, expected) &&
      hasRevealedEducationFields(row),
    signal,
  );
}

async function resetOwnedClone(
  document: Document,
  article: HTMLElement,
  row: EducationRow,
  originalRows: readonly HTMLElement[],
  selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
  expectedLength: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (isEmptyRow(row)) return true;
  const resetActions = Array.from(
    row.selectWrap.querySelectorAll<HTMLButtonElement>(
      ":scope > .select-option.education-option > button.btn-option-reset",
    ),
  );
  if (
    signalAborted(signal) ||
    !isVisibleControl(row.trigger) ||
    resetActions.length !== 1
  ) {
    return false;
  }
  row.trigger.click();
  if (
    signalAborted(signal) ||
    !isVisibleControl(row.trigger) ||
    !isVisibleEnabledOption(resetActions[0]!)
  ) {
    return false;
  }
  resetActions[0]!.click();
  return waitFor(
    document,
    () =>
      !signalAborted(signal) &&
      isStable(article, originalRows, selectedOriginalRows, expectedLength) &&
      isEmptyRow(row),
    signal,
  );
}

export async function prepareHyundaiEducation(
  document: Document,
  profile: Profile,
  signal?: AbortSignal,
): Promise<boolean> {
  if (
    document.location.host !== "talent.hyundai.com" ||
    document.location.pathname !== "/apply/applyWrite.hc"
  ) {
    return false;
  }
  const expectedKinds = profileKinds(profile);
  if (!expectedKinds || signalAborted(signal)) return false;
  if (expectedKinds.length === 0) return true;

  const articles = Array.from(
    document.querySelectorAll<HTMLElement>("#academic.field-form-apply"),
  );
  if (articles.length !== 1) return false;
  const article = articles[0]!;
  let rows = currentRows(article);
  if (!rows || rows.length > expectedKinds.length) return false;

  const originalRows = rows.map((row) => row.element);
  const selectedOriginalRows = new Map<HTMLElement, ProtectedOriginalRow>();
  for (const [index, row] of rows.entries()) {
    const expected = expectedKinds[index]!;
    if (!optionsAreComplete(row)) return false;
    if (row.hidden.value.trim()) {
      if (!selectionMatches(row, expected)) return false;
      selectedOriginalRows.set(row.element, {
        kind: expected,
        valueSignature: rowValueSignature(row),
      });
    } else if (!isEmptyRow(row)) {
      return false;
    }
  }

  const addCount = expectedKinds.length - rows.length;
  if (addCount > 0) {
    for (let count = 0; count < addCount; count += 1) {
      if (
        signalAborted(signal) ||
        !isStable(article, originalRows, selectedOriginalRows, rows.length)
      ) {
        return false;
      }
      const lastRow = rows.at(-1);
      const actions = Array.from(
        lastRow?.element.querySelectorAll<HTMLButtonElement>(
          ":scope > .button-wrap > button.btn-group-add",
        ) ?? [],
      );
      if (actions.length !== 1) return false;
      if (!isVisibleEnabledOption(actions[0]!)) return false;
      actions[0]!.click();
      const expectedLength = rows.length + 1;
      const added = await waitFor(
        document,
        () =>
          !signalAborted(signal) &&
          directRows(article).length === expectedLength,
        signal,
      );
      if (
        !added ||
        !isStable(article, originalRows, selectedOriginalRows, expectedLength)
      ) {
        return false;
      }
      rows = currentRows(article);
      if (!rows) return false;
      const cloneReset = await resetOwnedClone(
        document,
        article,
        rows.at(-1)!,
        originalRows,
        selectedOriginalRows,
        expectedLength,
        signal,
      );
      if (!cloneReset) return false;
    }
  }

  if (
    !isStable(article, originalRows, selectedOriginalRows, expectedKinds.length)
  ) {
    return false;
  }
  rows = currentRows(article);
  if (!rows) return false;
  for (const [index, row] of rows.entries()) {
    const expected = expectedKinds[index]!;
    if (selectionMatches(row, expected)) continue;
    const selected = await selectKind(
      document,
      article,
      row,
      expected,
      originalRows,
      selectedOriginalRows,
      expectedKinds.length,
      signal,
    );
    if (!selected) return false;
  }
  return (
    !signalAborted(signal) &&
    isStable(
      article,
      originalRows,
      selectedOriginalRows,
      expectedKinds.length,
    ) &&
    (currentRows(article)?.every((row, index) =>
      selectionMatches(row, expectedKinds[index]!),
    ) ??
      false)
  );
}
