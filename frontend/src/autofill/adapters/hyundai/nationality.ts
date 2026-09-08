import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

const DISPLAY_NAME = "대한민국";
const NATIONALITY_CODE = "KR";
const SEARCH_TIMEOUT_MILLISECONDS = 3_000;
const PROFILE_FIELD_KEY = "personal.personal.nationality";

interface NationalityField {
  display: HTMLInputElement;
  hidden: HTMLInputElement;
  results: HTMLElement;
}

interface FieldState {
  displayValue: string;
  hiddenValue: string;
  searchResult: string | null;
}

function normalize(value: string | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim() ?? "";
}

function verifiedProfileBinding(item: ReviewPlanItem): boolean {
  const binding = item.analysis?.valueBinding;
  if (
    binding?.profileFieldKey !== PROFILE_FIELD_KEY ||
    normalize(item.profileValue) !== DISPLAY_NAME
  ) {
    return false;
  }
  if (binding.type === "DIRECT") return true;
  return (
    binding.type === "LOOKUP" &&
    normalize(binding.optionMap[item.profileValue ?? ""]) === DISPLAY_NAME
  );
}

function verifiedItem(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  return (
    item.candidateId === handle.candidateId &&
    item.selected &&
    !item.disabled &&
    item.analysis?.candidateId === item.candidateId &&
    item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.interactionStatus === "READY" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    verifiedProfileBinding(item)
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
): NationalityField | undefined {
  const display = handle.elements[0];
  if (
    document.location.host !== "talent.hyundai.com" ||
    document.location.pathname !== "/apply/applyWrite.hc" ||
    handle.elements.length !== 1 ||
    handle.candidate.domId !== "nationCd1Nm" ||
    handle.candidate.domName !== "nationCd1Nm" ||
    handle.candidate.element !== "input" ||
    handle.candidate.control !== "text" ||
    !(display instanceof HTMLInputElement) ||
    display.ownerDocument !== document ||
    !display.isConnected ||
    display.disabled ||
    display.readOnly ||
    display.id !== "nationCd1Nm" ||
    display.name !== "nationCd1Nm" ||
    display.type !== "text" ||
    display.dataset.autoType !== "basic" ||
    display.dataset.autoApi !== "0200" ||
    display.dataset.autoParams !== "0003"
  ) {
    return undefined;
  }
  const field = display.closest<HTMLElement>(".field.search");
  if (!field || field.matches("[hidden], [aria-hidden='true'], [inert]")) {
    return undefined;
  }
  const ownedDisplay = uniqueOwnedElement<HTMLInputElement>(
    field,
    "input#nationCd1Nm[name='nationCd1Nm'][type='text']",
  );
  const hidden = uniqueOwnedElement<HTMLInputElement>(
    field,
    "input[type='hidden'][name='nationCd1']",
  );
  const results = uniqueOwnedElement<HTMLElement>(field, ".search-result-list");
  return ownedDisplay === display && hidden && results
    ? { display, hidden, results }
    : undefined;
}

function currentState(field: NationalityField): FieldState {
  return {
    displayValue: field.display.value,
    hiddenValue: field.hidden.value,
    searchResult: field.display.getAttribute("data-search-result"),
  };
}

function isConfirmed(field: NationalityField): boolean {
  return (
    normalize(field.display.value) === DISPLAY_NAME &&
    normalize(field.display.dataset.searchResult) === DISPLAY_NAME &&
    field.hidden.value === NATIONALITY_CODE
  );
}

function isBlank(field: NationalityField): boolean {
  return (
    normalize(field.display.value) === "" &&
    normalize(field.display.dataset.searchResult) === "" &&
    field.hidden.value.trim() === ""
  );
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
  field: NationalityField,
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

function exactResultButtons(
  results: HTMLElement,
  query: string,
): HTMLButtonElement[] {
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
  return matches.length === 1 && matches[0]?.dataset.code === NATIONALITY_CODE
    ? matches
    : [];
}

function waitForFreshExactResult(
  document: Document,
  field: NationalityField,
  query: string,
  signal?: AbortSignal,
): Promise<HTMLButtonElement | undefined> {
  const view = document.defaultView;
  if (!view || signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let finished = false;
    let changed = false;
    const finish = (button: HTMLButtonElement | undefined) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      view.clearTimeout(timeout);
      signal?.removeEventListener("abort", aborted);
      resolve(button);
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
      const matches = exactResultButtons(field.results, query);
      finish(matches.length === 1 ? matches[0] : undefined);
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

export async function runHyundaiNationality(
  document: Document,
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted || !verifiedItem(item, handle)) return false;
  const field = verifiedField(document, handle);
  if (!field) return false;
  if (isConfirmed(field)) return true;
  if (normalize(item.currentValue) !== normalize(field.display.value)) {
    return false;
  }
  if (!isBlank(field)) return false;

  const before = currentState(field);
  const result = await waitForFreshExactResult(
    document,
    field,
    DISPLAY_NAME,
    signal,
  );
  if (
    signal?.aborted ||
    !result ||
    !field.display.isConnected ||
    !field.hidden.isConnected ||
    !field.results.isConnected ||
    field.display.value !== DISPLAY_NAME ||
    field.hidden.value !== before.hiddenValue ||
    field.display.getAttribute("data-search-result") !== before.searchResult ||
    !result.isConnected ||
    result.closest(".search-result-list") !== field.results
  ) {
    restoreIfUnchanged(field, DISPLAY_NAME, before);
    return false;
  }

  result.click();
  const verifiedAfterClick = verifiedField(document, handle);
  if (
    verifiedAfterClick?.display !== field.display ||
    verifiedAfterClick.hidden !== field.hidden ||
    verifiedAfterClick.results !== field.results ||
    !isConfirmed(field)
  ) {
    restoreIfUnchanged(field, DISPLAY_NAME, before);
    return false;
  }
  return true;
}
