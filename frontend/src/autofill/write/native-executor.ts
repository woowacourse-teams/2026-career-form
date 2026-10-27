import { traceWrite } from "../debug/write-trace";
import { resolveChoiceOption } from "../profile/choice-option";
import { localWorkflowLog } from "../debug/local-workflow";
import {
  isSplitEmailTarget,
  SPLIT_EMAIL_REASON,
  splitEmailRetained,
  writeSplitEmail,
} from "../dom/split-email";
import {
  isVisibleWriteElement,
  primaryWriteElement,
  readbackWriteElement,
} from "../dom/write-target";
import {
  skipped,
  written,
  outcomeForWriteCode,
  type ApprovedWriteResult,
} from "./write-result";
export type { ApprovedWriteResult } from "./write-result";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { revalidateDateTarget } from "../review/date-target-format";
import { getWriteAdapter } from "../adapters/write";
import { normalizeDisplayName } from "./display-name";
import type { WriteFailureCode } from "./failure";
import { bindingKey, isSelectableApproved } from "./search-executor";
import { dropdownValue } from "../dom/button-dropdown";
import { catalogApprovalForItem } from "../profile/catalog-identity";
import {
  matchesApprovedCatalog,
  type ApprovedCatalogMatch,
} from "../profile/catalog-match";
import { catalogEvidenceForElement } from "../profile/catalog-evidence";
import {
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../profile/catalog-receipt";

type WriteOutcome =
  | { written: true }
  | {
      written: false;
      reason: string;
      code?: Extract<ApprovedWriteResult, { status: "skipped" }>["code"];
      failureCode?: WriteFailureCode;
    };

const UNSAFE = "네이티브 컨트롤에 안전하게 입력할 수 없습니다.";
const STALE = "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.";
const CONFLICT = "입력 직전 지원서에 다른 값이 있어 기존 값을 보존했습니다.";
const RETENTION = "입력 후 값이 유지되지 않아 확인이 필요합니다.";
const FORBIDDEN =
  /약관|동의|agreement|consent|인증|verification|verify|auth|login|password|비밀번호|upload|첨부|file|검색|search|lookup/i;

export type WriteResultListener = (
  item: ReviewPlanItem,
  result: ApprovedWriteResult,
  registry: CandidateRegistry,
) => void;

function dispatchValueEvents(element: Element): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * React records the last value it observed through the element instance
 * setter. A native-setter write must invalidate that record so the following
 * input event is treated as a user change and reaches framework state.
 */
function resetValueTracker(element: Element): void {
  const tracker = (
    element as Element & {
      _valueTracker?: { setValue(value: string): void };
    }
  )._valueTracker;
  tracker?.setValue("");
}

/** Mirror the browser's text-editing event, not an untyped Event. */
function inputEvent(value: string): InputEvent {
  return new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: value,
  });
}

function setNativeValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
): boolean {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(element, value);
  return element.value === value;
}

function setNativeChecked(element: HTMLInputElement): boolean {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;
  if (!setter) return false;
  setter.call(element, true);
  return element.checked;
}

/**
 * Option names match when their normalized display names are equal, or when
 * both are plain decimal numbers of the same value (a stored "4.50" selects the
 * site's "4.5"). Anything with units or text still needs an exact name.
 */
/** Numeric equivalence ("4.0" = "4") is a generic-only relaxation; adapters keep exact labels. */
function sameOptionName(left: string, right: string, numeric = false): boolean {
  const a = normalizeDisplayName(left),
    b = normalizeDisplayName(right);
  if (a === b) return true;
  if (!numeric) return false;
  const plain = /^\d+(\.\d+)?$/;
  return plain.test(a) && plain.test(b) && Number(a) === Number(b);
}

function profileOptions(
  handle: FieldCandidateHandle,
  profileValue: string,
  match?: ApprovedCatalogMatch,
  numeric = false,
): HTMLElement[] {
  const matches = (handle.candidate.options ?? [])
    .filter((option) => sameOptionName(option.displayName, profileValue, numeric))
    .map((option) => handle.optionElements.get(option.optionId))
    .filter((option): option is HTMLElement => Boolean(option))
    // Generic only: adapters may target native options hidden behind styling.
    .filter((option) => !numeric || isVisibleWriteElement(option))
    .filter(
      (option) =>
        !match ||
        matchesApprovedCatalog(
          match,
          catalogEvidenceForElement(
            option,
            option instanceof HTMLOptionElement
              ? (option.parentElement?.parentElement ??
                  option.parentElement ??
                  option)
              : (option.parentElement ?? option),
          ),
        ),
    );
  return matches;
}

function profileOption(
  handle: FieldCandidateHandle,
  profileValue: string,
  match?: ApprovedCatalogMatch,
  numeric = false,
): HTMLElement | undefined {
  const matches = profileOptions(handle, profileValue, match, numeric);
  return matches.length === 1 && matches[0]!.isConnected
    ? matches[0]
    : undefined;
}

function writableHandle(
  item: ReviewPlanItem,
  lookup: ReturnType<CandidateRegistry["lookupField"]>,
): FieldCandidateHandle | undefined {
  if (lookup.status === "ready") return lookup.handle;
  if (
    lookup.status === "blocked" &&
    lookup.reason === "readonly" &&
    item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    lookup.handle.candidate.element === "input" &&
    lookup.handle.candidate.control === "text"
  )
    return lookup.handle;
  return undefined;
}

function forbiddenGenericReason(
  handle: FieldCandidateHandle,
): string | undefined {
  const element = primaryWriteElement(handle) ?? handle.elements[0];
  if (
    !element ||
    handle.candidate.element === "custom" ||
    handle.candidate.control === "custom"
  )
    return "커스텀 제어는 안전한 입력 관계를 확인할 수 없습니다.";
  if (
    element instanceof HTMLInputElement &&
    ["file", "hidden", "password", "submit", "reset", "image"].includes(
      element.type,
    )
  )
    return "파일·인증·제출 제어는 자동 입력하지 않습니다.";
  const context = [
    handle.candidate.displayName,
    handle.candidate.domId,
    handle.candidate.domName,
    handle.candidate.placeholder,
    ...(handle.candidate.semanticContext?.labels?.map(({ text }) => text) ??
      []),
  ]
    .join(" ")
    // "자격인증" names a qualification certificate, not identity verification.
    .replace(/자격\s*인증/g, "자격");
  if (element instanceof HTMLInputElement && element.type === "search")
    return "검색 제어는 자동 입력하지 않습니다.";
  return handle.candidate.semanticContext?.inputType === "search" ||
    FORBIDDEN.test(context)
    ? "검색·동의·인증 제어는 자동 입력하지 않습니다."
    : undefined;
}

function validSteppedValue(value: number, base: number, step: number): boolean {
  const offset = (value - base) / step;
  return Math.abs(offset - Math.round(offset)) < 1e-9;
}

function dateValue(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === value ? date.getTime() : undefined;
}

function validDateInput(input: HTMLInputElement, value: string): boolean {
  const numeric = dateValue(value);
  const min = input.min ? dateValue(input.min) : undefined;
  const max = input.max ? dateValue(input.max) : undefined;
  if (
    numeric === undefined ||
    (min !== undefined && numeric < min) ||
    (max !== undefined && numeric > max)
  )
    return false;
  const step = input.step === "any" ? undefined : Number(input.step || "1");
  return (
    step === undefined ||
    (Number.isInteger(step) &&
      step > 0 &&
      validSteppedValue(numeric, min ?? 0, step * 86_400_000))
  );
}

function validMonthInput(input: HTMLInputElement, value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const count = (month: string) =>
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const numeric = count(value);
  if (
    (input.min && numeric < count(input.min)) ||
    (input.max && numeric > count(input.max))
  )
    return false;
  const step = input.step === "any" ? undefined : Number(input.step || "1");
  return (
    step === undefined ||
    (Number.isInteger(step) &&
      step > 0 &&
      validSteppedValue(numeric, input.min ? count(input.min) : 0, step))
  );
}

function validNumberInput(input: HTMLInputElement, value: string): boolean {
  if (!/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return false;
  const numeric = Number(value),
    min = input.min === "" ? undefined : Number(input.min),
    max = input.max === "" ? undefined : Number(input.max);
  if (
    !Number.isFinite(numeric) ||
    (Number.isFinite(min) && numeric < min!) ||
    (Number.isFinite(max) && numeric > max!)
  )
    return false;
  const step = input.step === "any" ? undefined : Number(input.step || "1");
  return (
    step === undefined ||
    (Number.isFinite(step) &&
      step > 0 &&
      validSteppedValue(numeric, Number.isFinite(min) ? min! : 0, step))
  );
}

function validTextValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  strict: boolean,
): boolean {
  if (element.maxLength >= 0 && value.length > element.maxLength) return false;
  if (!(element instanceof HTMLInputElement)) return true;
  if (
    strict &&
    ["range", "color", "time", "datetime-local", "week"].includes(element.type)
  )
    return false;
  if (element.type === "date") return validDateInput(element, value);
  if (element.type === "month") return validMonthInput(element, value);
  return element.type !== "number" || validNumberInput(element, value);
}

function comboboxParts(input: HTMLInputElement): HTMLElement | undefined {
  const ids = input.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
  if (input.getAttribute("role") !== "combobox" || ids.length !== 1)
    return undefined;
  const listbox = input.ownerDocument.getElementById(ids[0]!);
  return listbox instanceof HTMLElement &&
    listbox.getAttribute("role") === "listbox"
    ? listbox
    : undefined;
}

function hasBlockedComboboxScope(
  option: HTMLElement,
  listbox: HTMLElement,
): boolean {
  for (
    let current: HTMLElement | null = option;
    current;
    current = current.parentElement
  ) {
    if (
      current !== listbox &&
      current.matches("[hidden], [aria-hidden='true'], [inert]")
    )
      return true;
  }
  return false;
}

function snapshottedComboboxOption(
  option: HTMLElement,
  listbox: HTMLElement,
): boolean {
  return (
    option.isConnected &&
    listbox.contains(option) &&
    option.getAttribute("role") === "option" &&
    option.getAttribute("aria-disabled") !== "true" &&
    !hasBlockedComboboxScope(option, listbox)
  );
}

function visibleComboboxOption(
  option: HTMLElement,
  listbox: HTMLElement,
): boolean {
  if (option.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
  for (
    let current: HTMLElement | null = option;
    current;
    current = current.parentElement
  ) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return listbox.isConnected;
}

function visibleExactComboboxOption(
  option: HTMLElement,
  listbox: HTMLElement,
  value: string,
  numeric = false,
): boolean {
  const matches = Array.from(
    listbox.querySelectorAll<HTMLElement>("[role='option']"),
  ).filter(
    (entry) =>
      sameOptionName(entry.textContent ?? "", value, numeric),
  );
  return (
    snapshottedComboboxOption(option, listbox) &&
    matches.length === 1 &&
    matches[0] === option &&
    visibleComboboxOption(option, listbox)
  );
}

function writeCombobox(
  handle: FieldCandidateHandle,
  value: string,
  numeric = false,
): WriteOutcome {
  const input = primaryWriteElement(handle);
  const listbox =
    input instanceof HTMLInputElement ? comboboxParts(input) : undefined;
  const option = profileOption(handle, value, undefined, numeric);
  if (
    !input ||
    !(input instanceof HTMLInputElement) ||
    input.readOnly ||
    !listbox ||
    !option ||
    !snapshottedComboboxOption(option, listbox)
  )
    return { written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL" };
  if (input.getAttribute("aria-expanded") !== "true") input.click();
  if (
    input.getAttribute("aria-expanded") !== "true" ||
    !visibleExactComboboxOption(option, listbox, value, numeric)
  )
    return { written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL" };
  option.click();
  return input.value === value &&
    option.getAttribute("aria-selected") === "true"
    ? { written: true }
    : { written: false, reason: RETENTION, code: "RETAINED_VALUE_UNCONFIRMED" };
}

function retainedComboboxValue(
  handle: FieldCandidateHandle,
  value: string,
): boolean {
  const input = readbackWriteElement(handle);
  if (!(input instanceof HTMLInputElement) || input.value !== value)
    return false;
  const listbox = comboboxParts(input);
  const option = profileOption(handle, value);
  if (!listbox || !option || !snapshottedComboboxOption(option, listbox))
    return false;
  if (option.getAttribute("aria-selected") !== "true") return false;
  const activeId = input.getAttribute("aria-activedescendant");
  return !activeId || (!!option.id && activeId === option.id);
}

function nativeSelectOption(
  handle: FieldCandidateHandle,
  value: string,
  match?: ApprovedCatalogMatch,
  numeric = false,
): HTMLOptionElement | undefined {
  const select = readbackWriteElement(handle),
    option = profileOption(handle, value, match, numeric);
  if (
    !(select instanceof HTMLSelectElement) ||
    !(option instanceof HTMLOptionElement)
  )
    return undefined;
  const matches = Array.from(select.options).filter((entry) =>
    match
      ? !entry.disabled &&
        entry.value !== "" &&
        matchesApprovedCatalog(
          match,
          catalogEvidenceForElement(entry, select.parentElement ?? select),
        )
      : sameOptionName(entry.textContent ?? "", value, numeric),
  );
  return matches.length === 1 && matches[0] === option && !option.disabled
    ? option
    : undefined;
}

function nativeChoiceOption(
  handle: FieldCandidateHandle,
  value: string,
  numeric = false,
): HTMLInputElement | undefined {
  const option = profileOption(handle, value, undefined, numeric);
  const label =
    option instanceof HTMLInputElement
      ? option.labels?.length === 1
        ? option.labels[0]?.textContent
        : option.getAttribute("aria-label")
      : undefined;
  return option instanceof HTMLInputElement &&
    !option.disabled &&
    handle.elements.includes(option) &&
    (!label || sameOptionName(label, value, numeric))
    ? option
    : undefined;
}

function choiceState(handle: FieldCandidateHandle): string {
  return handle.elements
    .filter(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.checked,
    )
    .map((element) => element.value)
    .join(", ");
}

function radioEscapesCapturedRow(
  handle: FieldCandidateHandle,
  option: HTMLInputElement,
): boolean {
  if (!option.name) return false;
  const group = Array.from(
    option.ownerDocument.querySelectorAll<HTMLInputElement>(
      "input[type='radio']",
    ),
  ).filter((entry) => entry.name === option.name && entry.form === option.form);
  return group.some((entry) => !handle.elements.includes(entry));
}

function hasGenericConflict(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const value = nativeChoiceValue(item, handle),
    command = item.analysis!.writePlan!.command,
    generic = item.analysis?.mappingStatus === "LLM_SUGGESTED";
  if (command === "SET_TEXT") {
    const current = readbackWriteElement(handle)?.value ?? "";
    return current !== "" && current !== value && current !== item.currentValue;
  }
  if (command === "SELECT_OPTION") {
    const select = readbackWriteElement(handle);
    const current =
      select instanceof HTMLSelectElement
        ? select.selectedOptions[0]?.value
          ? (select.selectedOptions[0].textContent ?? "")
          : ""
        : "";
    return (
      current !== "" &&
      !sameOptionName(current, value, generic) &&
      !sameOptionName(current, item.currentValue, generic)
    );
  }
  if (command === "CHECK_CHECKBOX")
    return choiceState(handle) !== item.currentValue;
  if (command !== "CHECK_RADIO") return false;
  const others = handle.elements.filter(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement &&
      element.checked &&
      element !== nativeChoiceOption(handle, value, generic),
  );
  // A reviewed conflict the user chose to replace may overwrite exactly the
  // choice shown in the review (by value or label); any later change stops.
  return (
    others.length > 0 &&
    !(
      item.status === "conflict" &&
      item.currentValue !== "" &&
      others.length === 1 &&
      (others[0].value === item.currentValue ||
        (others[0].labels?.[0]?.textContent ?? "").trim() ===
          item.currentValue)
    )
  );
}

function nativeChoiceValue(item: ReviewPlanItem, handle: FieldCandidateHandle): string {
  const value = item.profileValue ?? "";
  if (
    item.analysis?.mappingStatus !== "LLM_SUGGESTED" ||
    (handle.candidate.control !== "select" && handle.candidate.control !== "radio")
  )
    return value;
  // Catalog identity can distinguish equal labels; its approved evidence is
  // checked by nativeSelectOption rather than the label-only choice resolver.
  if (catalogApprovalForItem(item).status === "selected") return value;
  const match = resolveChoiceOption(
    item.analysis?.valueBinding?.profileFieldKey ?? item.profileFieldKey,
    value,
    handle.candidate.options,
  );
  return match.status === "unique" ? match.option.displayName : "";
}

/** The control this run wrote, so the settle readback reads the same one. */
const writtenTargets = new WeakMap<FieldCandidateHandle, Element>();

function settleElement(handle: FieldCandidateHandle) {
  return readbackWriteElement(handle, writtenTargets.get(handle));
}

function sameTextValue(
  item: ReviewPlanItem,
  actual: string,
  expected: string,
): boolean {
  return item.dateApproval
    ? actual.replace(/\D/g, "") === expected.replace(/\D/g, "")
    : actual === expected;
}

function writeGeneric(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
  strict: boolean,
): WriteOutcome {
  const command = item.analysis!.writePlan!.command,
    value = nativeChoiceValue(item, handle),
    generic = item.analysis?.mappingStatus === "LLM_SUGGESTED";
  writtenTargets.delete(handle);
  if (!value && (command === "SELECT_OPTION" || command === "CHECK_RADIO"))
    return {
      written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL",
      ...(command === "SELECT_OPTION" ? { failureCode: "OPTION_UNMATCHED" as const } : {}),
    };
  if (strict && hasGenericConflict(item, handle))
    return { written: false, reason: CONFLICT, code: "CONFLICT" };
  traceWrite(item.candidateId, {
    targetFound: false,
    setterCalled: false,
    valueAfterWrite: false,
  });
  if (command === "SET_TEXT") {
    const element = primaryWriteElement(handle);
    traceWrite(item.candidateId, { targetFound: element !== undefined });
    if (
      element instanceof HTMLInputElement &&
      element.getAttribute("role") === "combobox"
    )
      return writeCombobox(handle, value, generic);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !(item.dateApproval ? true : validTextValue(element, value, strict))
    )
      return {
        written: false,
        reason: "날짜·숫자·길이 형식을 손실 없이 확인할 수 없습니다.",
        code: "UNSUPPORTED_FORMAT",
      };
    writtenTargets.set(handle, element);
    if (item.dateApproval && sameTextValue(item, element.value, value))
      return { written: true };
    resetValueTracker(element);
    traceWrite(item.candidateId, { setterCalled: true });
    if (!setNativeValue(element, value)) {
      return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
    }
    element.dispatchEvent(inputEvent(value));
    if (item.dateApproval && !sameTextValue(item, element.value, value))
      return { written: false, reason: RETENTION, code: "EXECUTION_FAILED" };
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (item.dateApproval && !sameTextValue(item, element.value, value))
      return { written: false, reason: RETENTION, code: "EXECUTION_FAILED" };
    traceWrite(item.candidateId, {
      valueAfterWrite: sameTextValue(item, element.value, value),
    });
    return { written: true };
  }
  if (command === "SELECT_OPTION") {
    const approval = catalogApprovalForItem(item);
    const select = primaryWriteElement(handle),
      option = nativeSelectOption(
        handle,
        value,
        approval.status === "selected" ? approval.match : undefined,
        generic,
      );
    if (!(select instanceof HTMLSelectElement) || !option) {
      // Local QA: option labels are site UI text; the profile value is
      // reduced to its shape (digits → 9, letters → a) so no value leaks.
      localWorkflowLog("option-unmatched", {
        key: item.analysis?.valueBinding?.profileFieldKey ?? "",
        valueShape: value
          .replace(/[0-9]/g, "9")
          .replace(/[A-Za-z가-힣]/g, "a"),
        options: (handle.candidate.options ?? [])
          .map((option) => option.displayName)
          .join(" | ")
          .slice(0, 200),
      });
      return {
        written: false,
        reason: UNSAFE,
        code: "UNSUPPORTED_CONTROL",
        ...(select instanceof HTMLSelectElement &&
        profileOptions(
          handle,
          value,
          approval.status === "selected" ? approval.match : undefined,
          generic,
        ).length === 0
          ? { failureCode: "OPTION_UNMATCHED" as const }
          : {}),
      };
    }
    writtenTargets.set(handle, select);
    resetValueTracker(select);
    traceWrite(item.candidateId, { targetFound: true, setterCalled: true });
    if (
      !setNativeValue(select, option.value) ||
      select.selectedOptions[0] !== option
    )
      return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
    dispatchValueEvents(select);
    traceWrite(item.candidateId, {
      valueAfterWrite: select.selectedOptions[0] === option,
    });
    return { written: true };
  }
  const option = nativeChoiceOption(handle, value, generic);
  const expected =
    command === "CHECK_RADIO"
      ? "radio"
      : command === "CHECK_CHECKBOX"
        ? "checkbox"
        : undefined;
  if (
    !option ||
    !expected ||
    handle.candidate.control !== expected ||
    option.type !== expected ||
    (strict && expected === "radio" && radioEscapesCapturedRow(handle, option))
  )
    return { written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL" };
  writtenTargets.set(handle, option);
  resetValueTracker(option);
  traceWrite(item.candidateId, { targetFound: true, setterCalled: true });
  if (!setNativeChecked(option))
    return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
  dispatchValueEvents(option);
  traceWrite(item.candidateId, { valueAfterWrite: option.checked });
  // Radio change handlers are derived from click by frameworks such as React.
  // Notify through the same activation event a user produces.
  if (expected === "radio" && generic)
    option.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
  return { written: true };
}

function catalogChoiceIsCurrent(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const approval = catalogApprovalForItem(item);
  if (approval.status === "invalid") return false;
  if (approval.status === "legacy") return true;
  const select = settleElement(handle);
  if (select instanceof HTMLSelectElement) {
    const matches = [...select.options].filter(
      (option) =>
        !option.disabled &&
        option.value !== "" &&
        matchesApprovedCatalog(
          approval.match,
          catalogEvidenceForElement(option, select.parentElement ?? select),
        ),
    );
    return (
      matches.length === 1 &&
      sameOptionName(
        matches[0].textContent ?? "",
        item.profileValue ?? "",
        item.analysis?.mappingStatus === "LLM_SUGGESTED",
      )
    );
  }
  if (
    select?.getAttribute("role") === "combobox" &&
    handle.optionElements.size
  ) {
    const matches = [...handle.optionElements.values()].filter(
      (option) =>
        option.isConnected &&
        matchesApprovedCatalog(
          approval.match,
          catalogEvidenceForElement(option, option.parentElement ?? option),
        ),
    );
    return (
      matches.length === 1 &&
      sameOptionName(
        matches[0].textContent ?? "",
        item.profileValue ?? "",
        item.analysis?.mappingStatus === "LLM_SUGGESTED",
      )
    );
  }
  return (
    item.analysis?.writePlan?.command !== "SET_TEXT" ||
    item.profileValue === approval.match.query
  );
}

function rememberNativeCatalogChoice(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const approval = catalogApprovalForItem(item);
  if (approval.status !== "selected") return approval.status !== "invalid";
  const element = readbackWriteElement(handle);
  const option =
    element instanceof HTMLSelectElement
      ? element.selectedOptions[0]
      : element?.getAttribute("role") === "combobox"
        ? profileOption(handle, item.profileValue ?? "")
        : undefined;
  if (!option || !element) return true;
  const label = option.textContent?.trim() ?? "";
  const code =
    option instanceof HTMLOptionElement
      ? option.value
      : option.getAttribute("data-value");
  return rememberCatalogSelection(item, {
    element,
    evidence: catalogEvidenceForElement(
      option,
      element.parentElement ?? option.parentElement ?? option,
      label,
    ),
    verify: () =>
      element.isConnected &&
      option.isConnected &&
      handle.isCurrentContext?.() !== false &&
      option.textContent?.trim() === label &&
      catalogChoiceIsCurrent(item, handle) &&
      (element instanceof HTMLSelectElement
        ? element.selectedOptions[0] === option && element.value === code
        : option.getAttribute("data-value") === code &&
          retainedComboboxValue(handle, label)),
  });
}

function writeItem(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): WriteOutcome {
  if (!catalogChoiceIsCurrent(item, handle))
    return { written: false, reason: STALE, code: "STALE_TARGET" };
  if (item.dateApproval) {
    const validation = revalidateDateTarget(
      handle,
      item.dateApproval,
      item.profileValue ?? "",
    );
    if (validation.status !== "valid")
      return { written: false, reason: STALE, code: "STALE_TARGET" };
  }
  const adapter = getWriteAdapter(
    (
      primaryWriteElement(handle) ??
      handle.elements[0] ??
      handle.customElements?.[0]
    )?.ownerDocument ?? "",
  );
  const attempt = adapter.tryWrite(handle, item);
  if (attempt.handled)
    return attempt.written
      ? { written: true }
      : { written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL" };
  if (item.analysis?.mappingStatus === "LLM_SUGGESTED") {
    const forbidden = forbiddenGenericReason(handle);
    return forbidden
      ? { written: false, reason: forbidden, code: "UNSUPPORTED_CONTROL" }
      : writeGeneric(item, handle, true);
  }
  return writeGeneric(item, handle, false);
}

function resultForItem(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
): ApprovedWriteResult {
  if (item.analysis?.writePlan?.command === "SELECT_DATE")
    return skipped(
      item.candidateId,
      "needs-verification",
      "NOT_APPROVED",
      "달력 선택은 별도 승인과 실행이 필요합니다.",
    );
  const generic = item.analysis?.mappingStatus === "LLM_SUGGESTED";
  try {
    const lookup = registry.lookupField(item.candidateId);
    const handle = writableHandle(item, lookup);
    if (!handle) {
      localWorkflowLog("lookup-miss", {
        status: lookup.status,
        reason: "reason" in lookup ? lookup.reason : undefined,
        command: item.analysis?.writePlan?.command,
        mapping: item.analysis?.mappingStatus,
      });
      const failureCode =
        lookup.status === "blocked" && lookup.reason === "disabled"
          ? ("FIELD_DISABLED" as const)
          : lookup.status === "blocked" && lookup.reason === "readonly"
            ? ("FIELD_READONLY" as const)
            : ("FIELD_CHANGED" as const);
      return {
        candidateId: item.candidateId,
        status: "skipped",
        reason: STALE,
        ...(generic
          ? {
              outcome: "needs-verification" as const,
              code: "STALE_TARGET" as const,
            }
          : {}),
        failureCode,
      };
    }
    if (
      generic &&
      item.analysis?.writePlan?.command === "SET_TEXT" &&
      (item.analysis.valueBinding?.profileFieldKey ??
        item.analysis.profileFieldKey ??
        item.profileFieldKey) === "contact.contact.email" &&
      isSplitEmailTarget(handle)
    ) {
      const split = writeSplitEmail(handle, item.profileValue ?? "");
      if (split === "written") return written(item.candidateId);
      // Only the local part went in; the domain is left to the applicant.
      if (split === "partial")
        return {
          candidateId: item.candidateId,
          status: "skipped",
          outcome: "needs-verification",
          code: "UNSUPPORTED_CONTROL",
          reason: SPLIT_EMAIL_REASON,
          failureCode: "SPLIT_EMAIL_UNSUPPORTED",
        };
      if (split === "conflict")
        return skipped(item.candidateId, "needs-verification", "CONFLICT", CONFLICT);
      return {
        candidateId: item.candidateId,
        status: "skipped",
        outcome: "unsupported",
        code: split === "failed" ? "EXECUTION_FAILED" : "UNSUPPORTED_CONTROL",
        reason: SPLIT_EMAIL_REASON,
        failureCode: "SPLIT_EMAIL_UNSUPPORTED",
      };
    }
    const outcome = writeItem(item, handle);
    if (outcome.written && !rememberNativeCatalogChoice(item, handle))
      return skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        RETENTION,
      );
    return outcome.written
      ? generic
        ? written(item.candidateId)
        : { candidateId: item.candidateId, status: "written" }
      : generic
        ? {
            ...skipped(
              item.candidateId,
              outcomeForWriteCode(outcome.code ?? "UNSUPPORTED_CONTROL"),
              outcome.code ?? "UNSUPPORTED_CONTROL",
              outcome.reason,
            ),
            ...(outcome.failureCode
              ? { failureCode: outcome.failureCode }
              : {}),
          }
        : {
            candidateId: item.candidateId,
            status: "skipped",
            reason: outcome.reason,
          };
  } catch {
    return generic
      ? skipped(
          item.candidateId,
          "failed",
          "EXECUTION_FAILED",
          "입력 중 지원서 상태가 변경되었습니다.",
        )
      : {
          candidateId: item.candidateId,
          status: "skipped",
          reason: "입력 중 지원서 상태가 변경되었습니다.",
        };
  }
}

export function executeApprovedWrites({
  items,
  approvedCandidateIds,
  registry,
}: {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
}): ApprovedWriteResult[] {
  const candidates = new Set<string>(),
    bindings = new Set<string>();
  const results = items.map((item): ApprovedWriteResult => {
    const key = bindingKey(item);
    if (
      !approvedCandidateIds.has(item.candidateId) ||
      !isSelectableApproved(item) ||
      candidates.has(item.candidateId) ||
      (key !== undefined && bindings.has(key))
    ) {
      const code: NonNullable<
        Extract<ApprovedWriteResult, { status: "skipped" }>["code"]
      > =
        item.status === "unavailable"
          ? "REVIEW_UNAVAILABLE"
          : key !== undefined && bindings.has(key)
            ? "DUPLICATE_BINDING"
            : "NOT_APPROVED";
      const reason =
        item.status === "unavailable"
          ? item.reason
          : "사용자가 승인한 입력 항목이 아닙니다.";
      return item.analysis?.mappingStatus === "LLM_SUGGESTED"
        ? skipped(item.candidateId, outcomeForWriteCode(code), code, reason)
        : { candidateId: item.candidateId, status: "skipped", reason };
    }
    candidates.add(item.candidateId);
    if (key) bindings.add(key);
    return resultForItem(item, registry);
  });
  results.forEach((result, index) => {
    if (result.status !== "written") return;
    const item = items[index],
      lookup = item && registry.lookupField(item.candidateId);
    if (item && lookup?.status === "ready")
      getWriteAdapter(
        (
          primaryWriteElement(lookup.handle) ??
          lookup.handle.elements[0] ??
          lookup.handle.customElements?.[0]
        )?.ownerDocument ?? "",
      ).afterWrite?.(lookup.handle, item);
  });
  return results;
}

function retainedGenericValue(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  if (!catalogChoiceIsCurrent(item, handle)) return false;
  if (
    (item.analysis?.valueBinding?.profileFieldKey ?? item.analysis?.profileFieldKey) ===
      "contact.contact.email" &&
    isSplitEmailTarget(handle)
  )
    return splitEmailRetained(handle, item.profileValue ?? "");
  const command = item.analysis?.writePlan?.command,
    value = nativeChoiceValue(item, handle),
    generic = item.analysis?.mappingStatus === "LLM_SUGGESTED";
  if (!command || !value) return false;
  const approval = catalogApprovalForItem(item);
  const element = handle.buttonDropdown?.trigger ?? settleElement(handle);
  if (
    approval.status === "selected" &&
    element &&
    retainedCatalogSelection(item, element) !== undefined
  )
    return true;
  if (
    approval.status === "selected" &&
    element &&
    (handle.buttonDropdown ||
      element instanceof HTMLSelectElement ||
      element.getAttribute("role") === "combobox" ||
      command === "SELECT_BUTTON_OPTION")
  )
    return false;
  if (handle.buttonDropdown)
    return (
      command === "SELECT_OPTION" &&
      dropdownValue(handle.buttonDropdown) === value
    );
  if (command === "SET_TEXT") {
    const input = settleElement(handle);
    if (!input?.isConnected) return false;
    return input instanceof HTMLInputElement &&
      input.getAttribute("role") === "combobox"
      ? retainedComboboxValue(handle, value)
      : sameTextValue(item, input.value, value);
  }
  if (command === "SELECT_OPTION") {
    const select = settleElement(handle);
    return (
      select instanceof HTMLSelectElement &&
      select.isConnected &&
      nativeSelectOption(handle, value, undefined, generic) ===
        select.selectedOptions[0]
    );
  }
  const option = nativeChoiceOption(handle, value, generic);
  return Boolean(
    option?.isConnected &&
    option.checked &&
    (command === "CHECK_RADIO" || command === "CHECK_CHECKBOX"),
  );
}

export function settledGenericResult(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
): ApprovedWriteResult {
  const lookup = registry.lookupField(item.candidateId);
  if (lookup.status !== "ready")
    return skipped(
      item.candidateId,
      "needs-verification",
      "STALE_TARGET",
      "페이지가 변경되어 입력 결과를 확인할 수 없습니다.",
    );
  const retained = retainedGenericValue(item, lookup.handle);
  traceWrite(item.candidateId, { valueAtSettle: retained });
  return retained
    ? written(item.candidateId)
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        RETENTION,
      );
}
