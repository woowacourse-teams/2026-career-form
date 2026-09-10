import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

const SEARCH_TIMEOUT_MILLISECONDS = 3_000;

interface SearchSpec {
  domName: "schNm" | "majorNm" | "dblMajorNm" | "minorNm";
  hiddenName: "schCd" | "major" | "dblMajor" | "minor";
  autoType: "school" | "basic";
  params: "0045" | "0047" | "0015";
  profileFieldKey: string;
}

interface SearchField {
  display: HTMLInputElement;
  hidden: HTMLInputElement;
  results: HTMLElement;
}

interface FieldState {
  displayValue: string;
  hiddenValue: string;
  searchResult: string | null;
  hasExistClass: boolean;
}

const SCHOOL_SPECS = new Map<string, SearchSpec>([
  [
    "educationhighschool",
    {
      domName: "schNm",
      hiddenName: "schCd",
      autoType: "school",
      params: "0045",
      profileFieldKey: "education.highSchool.schoolName",
    },
  ],
  [
    "educationuniversity",
    {
      domName: "schNm",
      hiddenName: "schCd",
      autoType: "school",
      params: "0047",
      profileFieldKey: "education.university.schoolName",
    },
  ],
  [
    "educationgraduateschool",
    {
      domName: "schNm",
      hiddenName: "schCd",
      autoType: "school",
      params: "0047",
      profileFieldKey: "education.graduateSchool.schoolName",
    },
  ],
]);

const MAJOR_SPECS = new Map<string, SearchSpec>([
  [
    "educationuniversity",
    {
      domName: "majorNm",
      hiddenName: "major",
      autoType: "basic",
      params: "0015",
      profileFieldKey: "education.university.majorName",
    },
  ],
  [
    "educationgraduateschool",
    {
      domName: "majorNm",
      hiddenName: "major",
      autoType: "basic",
      params: "0015",
      profileFieldKey: "education.graduateSchool.majorName",
    },
  ],
]);

const ADDITIONAL_MAJOR_SPECS = new Map<string, SearchSpec>([
  [
    "dblMajorNm",
    {
      domName: "dblMajorNm",
      hiddenName: "dblMajor",
      autoType: "basic",
      params: "0015",
      profileFieldKey: "education.university.additionalMajorName",
    },
  ],
  [
    "minorNm",
    {
      domName: "minorNm",
      hiddenName: "minor",
      autoType: "basic",
      params: "0015",
      profileFieldKey: "education.university.minorName",
    },
  ],
]);

function normalize(value: string | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim() ?? "";
}

function searchSpec(handle: FieldCandidateHandle): SearchSpec | undefined {
  const specs =
    handle.candidate.domName === "schNm"
      ? SCHOOL_SPECS
      : handle.candidate.domName === "majorNm"
        ? MAJOR_SPECS
        : handle.itemGroupId === "educationuniversity"
          ? ADDITIONAL_MAJOR_SPECS
          : undefined;
  return handle.itemGroupId && specs
    ? specs === ADDITIONAL_MAJOR_SPECS
      ? specs.get(handle.candidate.domName ?? "")
      : specs.get(handle.itemGroupId)
    : undefined;
}

function verifiedItem(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
  spec: SearchSpec,
): boolean {
  const binding = item.analysis?.valueBinding;
  return (
    item.candidateId === handle.candidateId &&
    item.selected &&
    !item.disabled &&
    item.analysis?.candidateId === item.candidateId &&
    item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.interactionStatus === "READY" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === spec.profileFieldKey &&
    normalize(item.profileValue) !== ""
  );
}

function uniqueOwnedElement<T extends Element>(
  field: HTMLElement,
  selector: string,
): T | undefined {
  const matches = Array.from(field.querySelectorAll<T>(selector)).filter(
    (element) => element.closest(".field.search") === field,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function verifiedField(
  document: Document,
  handle: FieldCandidateHandle,
  spec: SearchSpec,
): SearchField | undefined {
  const display = handle.elements[0];
  const expectedId = new RegExp(`^${spec.domName}_[1-9][0-9]*$`);
  if (
    document.location.host !== "talent.hyundai.com" ||
    document.location.pathname !== "/apply/applyWrite.hc" ||
    handle.isCurrentContext?.() === false ||
    handle.elements.length !== 1 ||
    handle.candidate.domName !== spec.domName ||
    !handle.candidate.domId ||
    !expectedId.test(handle.candidate.domId) ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "text" ||
    !(display instanceof HTMLInputElement) ||
    display.ownerDocument !== document ||
    !display.isConnected ||
    display.disabled ||
    display.readOnly ||
    display.id !== handle.candidate.domId ||
    display.name !== spec.domName ||
    display.type !== "text" ||
    display.dataset.autoType !== spec.autoType ||
    display.dataset.autoApi !== "0200" ||
    display.dataset.autoParams !== spec.params
  ) {
    return undefined;
  }
  const field = display.closest<HTMLElement>(".field.search");
  if (!field || field.matches("[hidden], [aria-hidden='true'], [inert]")) {
    return undefined;
  }
  const ownedDisplay = uniqueOwnedElement<HTMLInputElement>(
    field,
    `input#${display.id}[name='${spec.domName}'][type='text']`,
  );
  const hidden = uniqueOwnedElement<HTMLInputElement>(
    field,
    `input[type='hidden'][name='${spec.hiddenName}']`,
  );
  const results = uniqueOwnedElement<HTMLElement>(field, ".search-result-list");
  return ownedDisplay === display && hidden && results
    ? { display, hidden, results }
    : undefined;
}

function validResultCode(value: string | undefined): value is string {
  return Boolean(value?.trim() && value !== "9999");
}

function isConfirmed(field: SearchField, query: string): boolean {
  return (
    normalize(field.display.value) === query &&
    normalize(field.display.dataset.searchResult) === query &&
    validResultCode(field.hidden.value)
  );
}

function isBlank(field: SearchField): boolean {
  return (
    normalize(field.display.value) === "" &&
    normalize(field.display.dataset.searchResult) === "" &&
    field.hidden.value.trim() === ""
  );
}

function currentState(field: SearchField): FieldState {
  return {
    displayValue: field.display.value,
    hiddenValue: field.hidden.value,
    searchResult: field.display.getAttribute("data-search-result"),
    hasExistClass:
      field.display.closest(".field.search")?.classList.contains("exist") ??
      false,
  };
}

function restoreExistClass(field: SearchField, before: FieldState): void {
  field.display
    .closest(".field.search")
    ?.classList.toggle("exist", before.hasExistClass);
}

function setNativeValue(input: HTMLInputElement, value: string): boolean {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  setter.call(input, value);
  return input.value === value;
}

function restoreIfUnchanged(
  field: SearchField,
  query: string,
  before: FieldState,
): void {
  if (
    !field.display.isConnected ||
    field.display.value !== query ||
    field.hidden.value !== before.hiddenValue ||
    field.display.getAttribute("data-search-result") !== before.searchResult
  ) {
    return;
  }
  setNativeValue(field.display, before.displayValue);
  field.hidden.value = before.hiddenValue;
  if (before.searchResult === null) {
    field.display.removeAttribute("data-search-result");
  } else {
    field.display.setAttribute("data-search-result", before.searchResult);
  }
  restoreExistClass(field, before);
}

function restoreOwnedSelectionIfUnchanged(
  field: SearchField,
  query: string,
  code: string,
  before: FieldState,
): void {
  if (
    !field.display.isConnected ||
    field.display.value !== query ||
    field.hidden.value !== code ||
    normalize(field.display.dataset.searchResult) !== query
  ) {
    return;
  }
  setNativeValue(field.display, before.displayValue);
  field.hidden.value = before.hiddenValue;
  if (before.searchResult === null) {
    field.display.removeAttribute("data-search-result");
  } else {
    field.display.setAttribute("data-search-result", before.searchResult);
  }
  restoreExistClass(field, before);
}

function markConfirmed(field: SearchField): void {
  field.display.closest(".field.search")?.classList.add("exist");
}

function isVisibleAction(button: HTMLButtonElement): boolean {
  if (!button.isConnected || button.disabled || button.matches(":disabled")) {
    return false;
  }
  const view = button.ownerDocument.defaultView;
  if (!view) return false;
  for (
    let current: HTMLElement | null = button;
    current;
    current = current.parentElement
  ) {
    const style = view.getComputedStyle(current);
    if (
      current.hidden ||
      current.matches("[aria-hidden='true'], [inert]") ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      return false;
    }
  }
  return true;
}

function exactResult(
  results: HTMLElement,
  query: string,
): { button: HTMLButtonElement; code: string } | undefined {
  const matches = Array.from(
    results.querySelectorAll<HTMLButtonElement>(
      "li button.auto_result[type='button']",
    ),
  ).filter(
    (button) =>
      button.closest(".search-result-list") === results &&
      isVisibleAction(button) &&
      normalize(button.dataset.search) === query &&
      normalize(button.dataset.result) === query,
  );
  if (matches.length !== 1) return undefined;
  const button = matches[0]!;
  const code = button.dataset.code;
  return validResultCode(code) ? { button, code } : undefined;
}

function waitForFreshExactResult(
  document: Document,
  field: SearchField,
  query: string,
  signal?: AbortSignal,
): Promise<{ button: HTMLButtonElement; code: string } | undefined> {
  const view = document.defaultView;
  if (!view || signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let finished = false;
    let changed = false;
    const finish = (
      result: { button: HTMLButtonElement; code: string } | undefined,
    ) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      view.clearTimeout(timeout);
      signal?.removeEventListener("abort", aborted);
      resolve(result);
    };
    const aborted = () => finish(undefined);
    const inspect = () => {
      if (
        signal?.aborted ||
        !field.display.isConnected ||
        !field.hidden.isConnected ||
        !field.results.isConnected ||
        field.display.value !== query
      ) {
        finish(undefined);
        return;
      }
      if (!changed || field.results.childElementCount === 0) return;
      finish(exactResult(field.results, query));
    };
    const observer = new view.MutationObserver(() => {
      changed = true;
      inspect();
    });
    observer.observe(field.results, { childList: true, subtree: true });
    const timeout = view.setTimeout(
      () => finish(undefined),
      SEARCH_TIMEOUT_MILLISECONDS,
    );
    signal?.addEventListener("abort", aborted, { once: true });

    if (signal?.aborted || !setNativeValue(field.display, query)) {
      finish(undefined);
      return;
    }
    field.display.dispatchEvent(new view.Event("input", { bubbles: true }));
    field.display.dispatchEvent(
      new view.KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }),
    );
  });
}

export async function runHyundaiEducationSearch(
  document: Document,
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  const spec = searchSpec(handle);
  if (!spec || !verifiedItem(item, handle, spec)) return false;
  const field = verifiedField(document, handle, spec);
  if (!field) return false;
  const query = normalize(item.profileValue);
  if (isConfirmed(field, query)) {
    markConfirmed(field);
    return true;
  }
  if (
    normalize(item.currentValue) !== normalize(field.display.value) ||
    !isBlank(field)
  ) {
    return false;
  }

  const before = currentState(field);
  const result = await waitForFreshExactResult(document, field, query, signal);
  if (
    signal?.aborted ||
    !result ||
    handle.isCurrentContext?.() === false ||
    !field.display.isConnected ||
    !field.hidden.isConnected ||
    !field.results.isConnected ||
    field.display.value !== query ||
    field.hidden.value !== before.hiddenValue ||
    field.display.getAttribute("data-search-result") !== before.searchResult ||
    !result.button.isConnected ||
    result.button.closest(".search-result-list") !== field.results
  ) {
    restoreIfUnchanged(field, query, before);
    return false;
  }

  result.button.click();
  const verifiedAfterClick = verifiedField(document, handle, spec);
  if (
    verifiedAfterClick?.display !== field.display ||
    verifiedAfterClick.hidden !== field.hidden ||
    verifiedAfterClick.results !== field.results ||
    !isConfirmed(field, query) ||
    field.hidden.value !== result.code
  ) {
    restoreOwnedSelectionIfUnchanged(field, query, result.code, before);
    return false;
  }
  markConfirmed(field);
  return true;
}
