import type { CandidateRegistry } from "../dom/candidate-registry";
import {
  closeDropdown,
  captureDropdownProbe,
  confirmDropdownSelection,
  dropdownIsCurrent,
  dropdownValue,
  openDropdown,
  revalidateDropdown,
} from "../dom/button-dropdown";
import type { ReviewPlanItem } from "../review/review-plan";
import { isSelectableApproved } from "./search-executor";
import { normalizeDisplayName } from "./display-name";
import { skipped, written, type ApprovedWriteResult } from "./write-result";
import type { WriteFailureCode } from "./failure";
import { catalogApprovalForItem } from "../profile/catalog-identity";
import { matchesApprovedCatalog } from "../profile/catalog-match";
import { catalogEvidenceForElement } from "../profile/catalog-evidence";
import {
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "../profile/catalog-receipt";

export async function executeButtonDropdownWrite({
  item,
  registry,
  assertCurrent,
  beforeMutation,
  signal,
}: {
  item: ReviewPlanItem;
  registry: CandidateRegistry;
  assertCurrent: () => boolean;
  beforeMutation?: () => Promise<boolean>;
  signal?: AbortSignal;
}): Promise<ApprovedWriteResult> {
  const unsupported = (
    failureCode?: WriteFailureCode,
  ): ApprovedWriteResult => ({
    candidateId: item.candidateId,
    status: "skipped",
    outcome: "unsupported",
    code: "UNSUPPORTED_CONTROL",
    reason: "드롭다운 소유 관계와 일치 옵션을 확인할 수 없습니다.",
    ...(failureCode ? { failureCode } : {}),
  });
  const stale = () =>
    skipped(
      item.candidateId,
      "needs-verification",
      "STALE_TARGET",
      "승인 후 드롭다운 또는 프로필 상태가 변경되었습니다.",
    );
  const lookup = registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") return stale();
  const dropdown = lookup.handle.buttonDropdown;
  const value = item.profileValue;
  const approval = catalogApprovalForItem(item);
  if (approval.status === "invalid") return stale();
  const approvalStamp = JSON.stringify(approval);
  if (
    !dropdown ||
    !value ||
    !isSelectableApproved(item) ||
    item.analysis?.mappingStatus !== "LLM_SUGGESTED" ||
    item.analysis.writePlan?.command !== "SELECT_OPTION"
  )
    return unsupported();
  const current = () =>
    assertCurrent() &&
    !signal?.aborted &&
    isSelectableApproved(item) &&
    item.profileValue === value &&
    JSON.stringify(catalogApprovalForItem(item)) === approvalStamp &&
    registry.lookupField(item.candidateId).status === "ready" &&
    dropdownIsCurrent(dropdown);
  const live = dropdownValue(dropdown);
  if (!current() || live === undefined) return stale();
  if (live !== "" && live !== value && live !== item.currentValue)
    return skipped(
      item.candidateId,
      "needs-verification",
      "CONFLICT",
      "입력 직전 지원서에 다른 값이 있어 기존 값을 보존했습니다.",
    );
  if (
    live === value &&
    (approval.status === "legacy" ||
      retainedCatalogSelection(item, dropdown.trigger) === live)
  )
    return {
      candidateId: item.candidateId,
      status: "skipped",
      outcome: "unchanged",
      code: "ALREADY_MATCHED",
      reason: "지원서에 같은 값이 이미 입력되어 있습니다.",
    };
  const opening = captureDropdownProbe(dropdown.trigger.ownerDocument);
  const menus = await openDropdown(dropdown.trigger, signal);
  const openedWithoutChanges = opening.unchanged();
  if (openedWithoutChanges) opening.release();
  let result: ApprovedWriteResult = unsupported();
  try {
    if (!openedWithoutChanges) return stale();
    const options = revalidateDropdown(dropdown, menus);
    const matches = options?.filter((option) =>
      approval.status === "selected"
        ? matchesApprovedCatalog(
            approval.match,
            catalogEvidenceForElement(
              option.element,
              dropdown.menu,
              option.text,
            ),
          )
        : normalizeDisplayName(option.text) === normalizeDisplayName(value),
    );
    const option = matches?.length === 1 ? matches[0] : undefined;
    if (matches?.length === 0) return unsupported("OPTION_UNMATCHED");
    if (
      !option ||
      option.element.closest(
        "[aria-disabled='true'], [disabled], [hidden], [inert]",
      )
    )
      return unsupported();
    const chosenValue = option.text;
    if (approval.status === "selected" && live === chosenValue)
      return unsupported();
    const evidence = catalogEvidenceForElement(
      option.element,
      dropdown.menu,
      option.text,
    );
    const chosenCode = option.element.getAttribute("data-value");
    const chosenId = option.element.getAttribute("data-code");
    if (
      !current() ||
      dropdownValue(dropdown) !== live ||
      (beforeMutation && !(await beforeMutation())) ||
      !current() ||
      dropdownValue(dropdown) !== live ||
      !revalidateDropdown(dropdown, menus)?.some(
        (entry) =>
          entry.element === option.element && entry.text === option.text,
      )
    )
      return stale();
    const reflected = await confirmDropdownSelection(
      dropdown,
      option.element,
      chosenValue,
      current,
      signal,
    );
    const reflectedCode = dropdown.trigger.getAttribute("data-value");
    const reflectedId = dropdown.trigger.getAttribute("data-code");
    result =
      reflected &&
      current() &&
      dropdownValue(dropdown) === chosenValue &&
      (chosenCode === null ||
        reflectedCode === null ||
        chosenCode === reflectedCode) &&
      (chosenId === null || reflectedId === null || chosenId === reflectedId) &&
      rememberCatalogSelection(item, {
        element: dropdown.trigger,
        evidence,
        verify: () =>
          current() &&
          dropdownValue(dropdown) === chosenValue &&
          option.element.isConnected &&
          option.element.textContent?.trim() === chosenValue &&
          option.element.getAttribute("data-value") === chosenCode &&
          option.element.getAttribute("data-code") === chosenId &&
          dropdown.trigger.getAttribute("data-value") === reflectedCode &&
          dropdown.trigger.getAttribute("data-code") === reflectedId,
      })
        ? written(item.candidateId)
        : skipped(
            item.candidateId,
            "needs-verification",
            "RETAINED_VALUE_UNCONFIRMED",
            "선택 후 실제 드롭다운 값을 확인하지 못했습니다.",
          );
  } finally {
    const closing = openedWithoutChanges
      ? captureDropdownProbe(dropdown.trigger.ownerDocument)
      : opening;
    try {
      const closed = await closeDropdown(dropdown.trigger, menus);
      if (!closing.unchanged()) {
        if (!closing.interrupted() && !closing.restore())
          throw new Error(
            "드롭다운 확인 중 변경된 지원서 값을 복구할 수 없습니다.",
          );
        result = stale();
      }
      if (!closed) result = stale();
    } finally {
      opening.release();
      closing.release();
    }
  }
  return result;
}
