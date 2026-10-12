import type { ReviewPlanItem } from "../review/review-plan";
import { catalogApprovalForItem } from "./catalog-identity";
import { matchesApprovedCatalog, type CatalogEvidence } from "./catalog-match";

interface SelectionReceipt {
  readonly approval: string;
  readonly binding: string;
  readonly label: string;
  /** Actual committed text of an input; display labels may be differently formatted. */
  readonly value?: string;
  readonly verify: (element: HTMLElement) => boolean;
}

const selections = new WeakMap<HTMLElement, SelectionReceipt>();
const itemSelections = new WeakMap<
  ReviewPlanItem,
  { element: HTMLElement; receipt: SelectionReceipt }
>();

export function hasCatalogSelection(element: HTMLElement): boolean {
  return selections.has(element);
}

/** Record an observed selection only after the consumer verifies its site code. */
export function rememberCatalogSelection(
  item: ReviewPlanItem,
  selection: {
    readonly element: HTMLElement;
    readonly evidence: CatalogEvidence;
    readonly verify: (element: HTMLElement) => boolean;
  },
): boolean {
  const approval = catalogApprovalForItem(item);
  if (approval.status === "legacy") return true;
  if (
    approval.status !== "selected" ||
    !matchesApprovedCatalog(approval.match, selection.evidence) ||
    !selection.element.isConnected ||
    !selection.verify(selection.element)
  )
    return false;
  const receipt: SelectionReceipt = {
    approval: JSON.stringify(approval.match),
    binding: JSON.stringify([
      item.profileFieldKey,
      item.profileEntryId,
      item.itemIndex,
      item.profileValue,
    ]),
    label: selection.evidence.label,
    ...(selection.element instanceof HTMLInputElement
      ? { value: selection.element.value }
      : {}),
    verify: selection.verify,
  };
  selections.set(selection.element, receipt);
  itemSelections.set(item, { element: selection.element, receipt });
  return true;
}

/** An alias set alone is never proof that this exact label/code was retained. */
export function retainedCatalogSelection(
  item: ReviewPlanItem,
  element: HTMLElement,
): string | undefined {
  const receipt = selections.get(element);
  const approval = catalogApprovalForItem(item);
  return receipt &&
    element.isConnected &&
    approval.status === "selected" &&
    receipt.binding ===
      JSON.stringify([
        item.profileFieldKey,
        item.profileEntryId,
        item.itemIndex,
        item.profileValue,
      ]) &&
    receipt.approval === JSON.stringify(approval.match) &&
    (receipt.value === undefined ||
      (element instanceof HTMLInputElement &&
        element.value === receipt.value)) &&
    receipt.verify(element)
    ? (receipt.value ?? receipt.label)
    : undefined;
}

/** A remount can reuse proof only if the consumer verifies the replacement code. */
export function rebindCatalogSelection(
  previous: ReviewPlanItem,
  current: ReviewPlanItem,
  element: HTMLElement,
): boolean {
  const source = itemSelections.get(previous);
  const approval = catalogApprovalForItem(current);
  if (
    !source ||
    source.element === element ||
    source.element.isConnected ||
    !element.isConnected ||
    approval.status !== "selected" ||
    source.receipt.approval !== JSON.stringify(approval.match) ||
    source.receipt.binding !==
      JSON.stringify([
        current.profileFieldKey,
        current.profileEntryId,
        current.itemIndex,
        current.profileValue,
      ]) ||
    (source.receipt.value !== undefined &&
      !(
        element instanceof HTMLInputElement &&
        element.value === source.receipt.value
      )) ||
    !source.receipt.verify(element)
  )
    return false;
  let changed = false;
  const invalidate = () => {
    changed = true;
    element.removeEventListener("input", invalidate);
    element.removeEventListener("change", invalidate);
  };
  element.addEventListener("input", invalidate);
  element.addEventListener("change", invalidate);
  const receipt: SelectionReceipt = {
    ...source.receipt,
    verify: (target) => !changed && source.receipt.verify(target),
  };
  selections.set(element, receipt);
  itemSelections.set(current, { element, receipt });
  return true;
}
