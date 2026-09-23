import {
  skipped,
  written,
  outcomeForWriteCode,
  type ApprovedWriteResult,
} from "./write-result";
export type { ApprovedWriteResult } from "./write-result";
import { acquireDocumentRun } from "../interaction/document-run";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { getWriteAdapter } from "../adapters/write";
import { normalizeDisplayName } from "./display-name";
import {
  bindingKey,
  executeApprovedSearchWrites,
  isSelectableApproved,
  settledSearchSelectionResult,
} from "./search-executor";

type WriteOutcome =
  | { written: true }
  | {
      written: false;
      reason: string;
      code?: Extract<ApprovedWriteResult, { status: "skipped" }>["code"];
    };

const UNSAFE = "네이티브 컨트롤에 안전하게 입력할 수 없습니다.";
const STALE = "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.";
const CONFLICT = "입력 직전 지원서에 다른 값이 있어 기존 값을 보존했습니다.";
const RETENTION = "입력 후 값이 유지되지 않아 확인이 필요합니다.";
const FORBIDDEN =
  /약관|동의|agreement|consent|인증|verification|verify|auth|login|password|비밀번호|upload|첨부|file|검색|search|lookup/i;

function dispatchValueEvents(element: Element): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
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

function profileOption(
  handle: FieldCandidateHandle,
  profileValue: string,
): HTMLElement | undefined {
  const desired = normalizeDisplayName(profileValue);
  const matches = (handle.candidate.options ?? [])
    .filter((option) => normalizeDisplayName(option.displayName) === desired)
    .map((option) => handle.optionElements.get(option.optionId))
    .filter((option): option is HTMLElement => Boolean(option));
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
  const element = handle.elements[0];
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
  ].join(" ");
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
): boolean {
  const matches = Array.from(
    listbox.querySelectorAll<HTMLElement>("[role='option']"),
  ).filter(
    (entry) =>
      normalizeDisplayName(entry.textContent ?? "") ===
      normalizeDisplayName(value),
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
): WriteOutcome {
  const input = handle.elements[0];
  const listbox =
    input instanceof HTMLInputElement ? comboboxParts(input) : undefined;
  const option = profileOption(handle, value);
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
    !visibleExactComboboxOption(option, listbox, value)
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
  const input = handle.elements[0];
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
): HTMLOptionElement | undefined {
  const select = handle.elements[0],
    option = profileOption(handle, value);
  if (
    !(select instanceof HTMLSelectElement) ||
    !(option instanceof HTMLOptionElement)
  )
    return undefined;
  const matches = Array.from(select.options).filter(
    (entry) =>
      normalizeDisplayName(entry.textContent ?? "") ===
      normalizeDisplayName(value),
  );
  return matches.length === 1 && matches[0] === option && !option.disabled
    ? option
    : undefined;
}

function nativeChoiceOption(
  handle: FieldCandidateHandle,
  value: string,
): HTMLInputElement | undefined {
  const option = profileOption(handle, value);
  const label =
    option instanceof HTMLInputElement
      ? option.labels?.length === 1
        ? option.labels[0]?.textContent
        : option.getAttribute("aria-label")
      : undefined;
  return option instanceof HTMLInputElement &&
    !option.disabled &&
    handle.elements.includes(option) &&
    (!label || normalizeDisplayName(label) === normalizeDisplayName(value))
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
  const value = item.profileValue!,
    command = item.analysis!.writePlan!.command;
  if (command === "SET_TEXT") {
    const current = handle.elements[0]?.value ?? "";
    return current !== "" && current !== value && current !== item.currentValue;
  }
  if (command === "SELECT_OPTION") {
    const select = handle.elements[0];
    const current =
      select instanceof HTMLSelectElement
        ? select.selectedOptions[0]?.value
          ? (select.selectedOptions[0].textContent ?? "")
          : ""
        : "";
    return (
      current !== "" &&
      normalizeDisplayName(current) !== normalizeDisplayName(value) &&
      normalizeDisplayName(current) !== normalizeDisplayName(item.currentValue)
    );
  }
  if (command === "CHECK_CHECKBOX")
    return choiceState(handle) !== item.currentValue;
  return (
    command === "CHECK_RADIO" &&
    handle.elements.some(
      (element) =>
        element instanceof HTMLInputElement &&
        element.checked &&
        element !== nativeChoiceOption(handle, value),
    )
  );
}

function writeGeneric(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
  strict: boolean,
): WriteOutcome {
  const command = item.analysis!.writePlan!.command,
    value = item.profileValue!;
  if (strict && hasGenericConflict(item, handle))
    return { written: false, reason: CONFLICT, code: "CONFLICT" };
  if (command === "SET_TEXT") {
    const element = handle.elements[0];
    if (
      element instanceof HTMLInputElement &&
      element.getAttribute("role") === "combobox"
    )
      return writeCombobox(handle, value);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !validTextValue(element, value, strict)
    )
      return {
        written: false,
        reason: "날짜·숫자·길이 형식을 손실 없이 확인할 수 없습니다.",
        code: "UNSUPPORTED_FORMAT",
      };
    if (!setNativeValue(element, value)) {
      return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
    }
    dispatchValueEvents(element);
    return { written: true };
  }
  if (command === "SELECT_OPTION") {
    const select = handle.elements[0],
      option = nativeSelectOption(handle, value);
    if (!(select instanceof HTMLSelectElement) || !option)
      return { written: false, reason: UNSAFE, code: "UNSUPPORTED_CONTROL" };
    if (
      !setNativeValue(select, option.value) ||
      select.selectedOptions[0] !== option
    )
      return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
    dispatchValueEvents(select);
    return { written: true };
  }
  const option = nativeChoiceOption(handle, value);
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
  if (!setNativeChecked(option))
    return { written: false, reason: UNSAFE, code: "EXECUTION_FAILED" };
  dispatchValueEvents(option);
  return { written: true };
}

function writeItem(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): WriteOutcome {
  const adapter = getWriteAdapter(
    handle.elements[0]?.ownerDocument.location?.host ?? "",
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
  const generic = item.analysis?.mappingStatus === "LLM_SUGGESTED";
  try {
    const handle = writableHandle(item, registry.lookupField(item.candidateId));
    if (!handle)
      return generic
        ? skipped(item.candidateId, "needs-verification", "STALE_TARGET", STALE)
        : { candidateId: item.candidateId, status: "skipped", reason: STALE };
    const outcome = writeItem(item, handle);
    return outcome.written
      ? generic
        ? written(item.candidateId)
        : { candidateId: item.candidateId, status: "written" }
      : generic
        ? skipped(
            item.candidateId,
            outcomeForWriteCode(outcome.code ?? "UNSUPPORTED_CONTROL"),
            outcome.code ?? "UNSUPPORTED_CONTROL",
            outcome.reason,
          )
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
        lookup.handle.elements[0]?.ownerDocument.location?.host ?? "",
      ).afterWrite?.(lookup.handle, item);
  });
  return results;
}

function retainedGenericValue(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const command = item.analysis?.writePlan?.command,
    value = item.profileValue;
  if (!command || !value) return false;
  if (command === "SET_TEXT") {
    const input = handle.elements[0];
    return input instanceof HTMLInputElement &&
      input.getAttribute("role") === "combobox"
      ? retainedComboboxValue(handle, value)
      : input?.value === value;
  }
  if (command === "SELECT_OPTION")
    return (
      handle.elements[0] instanceof HTMLSelectElement &&
      nativeSelectOption(handle, value) ===
        handle.elements[0].selectedOptions[0]
    );
  const option = nativeChoiceOption(handle, value);
  return Boolean(
    option?.checked &&
    (command === "CHECK_RADIO" || command === "CHECK_CHECKBOX"),
  );
}

function settledGenericResult(
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
  return retainedGenericValue(item, lookup.handle)
    ? written(item.candidateId)
    : skipped(
        item.candidateId,
        "needs-verification",
        "RETAINED_VALUE_UNCONFIRMED",
        RETENTION,
      );
}

export async function executeApprovedWritesAfterPageSettles({
  items,
  approvedCandidateIds,
  registry,
  interactionDecisionProvider,
  assertCurrent,
  beforeMutation,
  signal,
  document: suppliedDocument,
}: {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
  interactionDecisionProvider?: InteractionDecisionProvider;
  assertCurrent?: () => boolean;
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
  document?: Document;
}): Promise<ApprovedWriteResult[]> {
  const first = items[0] && registry.lookupField(items[0].candidateId);
  const document =
    suppliedDocument ??
    (first && "handle" in first
      ? first.handle.elements[0]?.ownerDocument
      : undefined);
  const release = document ? acquireDocumentRun(document) : undefined;
  if (document && !release)
    return items.map((item) =>
      skipped(
        item.candidateId,
        "needs-verification",
        "STALE_TARGET",
        "이미 자동 기입이 실행 중입니다.",
      ),
    );
  const url = document?.URL;
  const runCurrent = () =>
    !signal?.aborted && assertCurrent?.() !== false && document?.URL === url;
  try {
    const initial = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(),
      registry,
    });
    const halted = await executeApprovedSearchWrites({
      items,
      approvedCandidateIds,
      registry,
      interactionDecisionProvider,
      assertCurrent: runCurrent,
      beforeMutation,
      signal,
      writeOrdinary: (item) =>
        executeApprovedWrites({
          items: [item],
          approvedCandidateIds,
          registry,
        })[0]!,
      results: initial,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const adapterItems = items.filter(
      (item, index) =>
        !halted &&
        runCurrent() &&
        initial[index]?.status === "written" &&
        item.analysis?.mappingStatus === "ADAPTER_VERIFIED",
    );
    const retried: ApprovedWriteResult[] = [];
    for (const item of adapterItems) {
      if (
        !runCurrent() ||
        (beforeMutation && !(await beforeMutation())) ||
        !runCurrent()
      )
        break;
      retried.push(
        ...executeApprovedWrites({
          items: [item],
          approvedCandidateIds: new Set([item.candidateId]),
          registry,
        }),
      );
    }
    const adapterResults = new Map(
      retried.map((result) => [result.candidateId, result]),
    );
    let profileCurrent = true;
    try {
      profileCurrent = !beforeMutation || (await beforeMutation());
    } catch {
      profileCurrent = false;
    }
    return initial.map((result, index) => {
      const item = items[index];
      if (
        !item ||
        (result.status !== "written" && result.outcome !== "unchanged")
      )
        return result;
      if (!profileCurrent || !runCurrent())
        return skipped(
          item.candidateId,
          "needs-verification",
          "STALE_TARGET",
          "실행 중 프로필 또는 지원서 상태가 변경되어 입력 결과를 확인해 주세요.",
        );
      if (item.analysis?.writePlan?.command === "SEARCH_SELECTION")
        return settledSearchSelectionResult(item, registry, result);
      return item.analysis?.mappingStatus === "ADAPTER_VERIFIED"
        ? (adapterResults.get(item.candidateId) ?? result)
        : settledGenericResult(item, registry);
    });
  } finally {
    release?.();
  }
}
