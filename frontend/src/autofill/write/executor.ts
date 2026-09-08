import type { FieldCandidateHandle } from "../dom/types";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { getWriteAdapter } from "../adapters/write";
import { normalizeDisplayName } from "./display-name";

export type ApprovedWriteResult =
  | { candidateId: string; status: "written" }
  | { candidateId: string; status: "skipped"; reason: string };

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

function matchingLocalOption(
  handle: FieldCandidateHandle,
  profileValue: string,
): HTMLOptionElement | HTMLInputElement | undefined {
  const desired = normalizeDisplayName(profileValue);
  if (!desired || !handle.candidate.options) return undefined;

  const matches = handle.candidate.options.flatMap((option) => {
    const exact = normalizeDisplayName(option.displayName) === desired;
    if (!exact) return [];
    const element = handle.optionElements.get(option.optionId);
    if (!element) return [];
    const displayName =
      element instanceof HTMLOptionElement
        ? (element.textContent ?? "")
        : option.displayName;
    return normalizeDisplayName(displayName) === desired ? [element] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function isSelectableApproved(item: ReviewPlanItem): boolean {
  if (
    !item.selected ||
    item.disabled ||
    !item.analysis ||
    !item.profileValue ||
    item.status === "unavailable"
  ) {
    return false;
  }
  return item.status !== "sensitive" || item.revealed;
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
  ) {
    return lookup.handle;
  }
  return undefined;
}

function executeWrite(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const command = item.analysis?.writePlan?.command;
  const value = item.profileValue;
  if (!command || !value) return false;

  const adapter = getWriteAdapter(
    handle.elements[0]?.ownerDocument.location?.host ?? "",
  );
  const attempt = adapter.tryWrite(handle, item);
  if (attempt.handled) return attempt.written;

  if (command === "SET_TEXT") {
    if (
      handle.candidate.control !== "text" &&
      handle.candidate.control !== "textarea"
    ) {
      return false;
    }
    const element = handle.elements[0];
    if (!element || element instanceof HTMLSelectElement) return false;
    if (!setNativeValue(element, value)) return false;
    dispatchValueEvents(element);
    return true;
  }

  if (command === "SELECT_BUTTON_OPTION") {
    return false;
  }

  const option = matchingLocalOption(handle, value);
  if (!option) return false;

  if (command === "SELECT_OPTION") {
    const element = handle.elements[0];
    if (
      handle.candidate.control !== "select" ||
      !(element instanceof HTMLSelectElement) ||
      !(option instanceof HTMLOptionElement) ||
      !setNativeValue(element, option.value) ||
      !element.selectedOptions.length ||
      normalizeDisplayName(element.selectedOptions[0]?.textContent ?? "") !==
        normalizeDisplayName(value)
    ) {
      return false;
    }
    dispatchValueEvents(element);
    return true;
  }

  const expectedType = command === "CHECK_RADIO" ? "radio" : "checkbox";
  if (
    !(option instanceof HTMLInputElement) ||
    handle.candidate.control !== expectedType ||
    option.type !== expectedType ||
    !setNativeChecked(option)
  ) {
    return false;
  }
  dispatchValueEvents(option);
  return true;
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
  const processed = new Set<string>();
  const results: ApprovedWriteResult[] = items.map((item) => {
    if (
      processed.has(item.candidateId) ||
      !approvedCandidateIds.has(item.candidateId) ||
      !isSelectableApproved(item)
    ) {
      return {
        candidateId: item.candidateId,
        status: "skipped",
        reason: "사용자가 승인한 입력 항목이 아닙니다.",
      };
    }
    processed.add(item.candidateId);

    const lookup = registry.lookupField(item.candidateId);
    const handle = writableHandle(item, lookup);
    if (!handle) {
      return {
        candidateId: item.candidateId,
        status: "skipped",
        reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
      };
    }
    if (!executeWrite(item, handle)) {
      return {
        candidateId: item.candidateId,
        status: "skipped",
        reason: "네이티브 컨트롤에 안전하게 입력할 수 없습니다.",
      };
    }
    return { candidateId: item.candidateId, status: "written" };
  });

  const verifiedResults: ApprovedWriteResult[] = results.map(
    (result, index) => {
      const item = items[index];
      if (
        !item ||
        result.status !== "written" ||
        item.analysis?.writePlan?.command !== "SELECT_OPTION"
      ) {
        return result;
      }
      const lookup = registry.lookupField(item.candidateId);
      const handle = writableHandle(item, lookup);
      if (!handle || !executeWrite(item, handle)) {
        return {
          candidateId: item.candidateId,
          status: "skipped",
          reason: "다른 입력 변경 후 선택값을 유지하지 못했습니다.",
        };
      }
      return result;
    },
  );
  verifiedResults.forEach((result, index) => {
    if (result.status !== "written") return;
    const item = items[index];
    const lookup = registry.lookupField(result.candidateId);
    if (!item || lookup.status !== "ready") return;
    getWriteAdapter(
      lookup.handle.elements[0]?.ownerDocument.location?.host ?? "",
    ).afterWrite?.(lookup.handle, item);
  });
  return verifiedResults;
}

export async function executeApprovedWritesAfterPageSettles({
  items,
  approvedCandidateIds,
  registry,
}: {
  items: readonly ReviewPlanItem[];
  approvedCandidateIds: ReadonlySet<string>;
  registry: CandidateRegistry;
}): Promise<ApprovedWriteResult[]> {
  const initialResults = executeApprovedWrites({
    items,
    approvedCandidateIds,
    registry,
  });
  const completedItems = items.filter(
    (_item, index) => initialResults[index]?.status === "written",
  );
  if (completedItems.length === 0) return initialResults;

  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const retryResults = executeApprovedWrites({
    items: completedItems,
    approvedCandidateIds: new Set(
      completedItems.map((item) => item.candidateId),
    ),
    registry,
  });
  const retryByCandidateId = new Map(
    retryResults.map((result) => [result.candidateId, result]),
  );
  return initialResults.map(
    (result) => retryByCandidateId.get(result.candidateId) ?? result,
  );
}
