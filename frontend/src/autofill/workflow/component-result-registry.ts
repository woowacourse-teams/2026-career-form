import { componentSelector } from "../policy/component-dom";
import { CandidateRegistry } from "../dom/candidate-registry";
import { collectFieldsSnapshot } from "../dom/collect";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";

interface ResultTarget {
  candidateId: string;
  domName: string;
  element: FieldCandidateHandle["candidate"]["element"];
  control: FieldCandidateHandle["candidate"]["control"];
  tagName: string;
  inputType: string;
  itemGroupId?: string;
  itemIndex?: number;
  rowCount?: number;
  row?: Element;
  rowContainer?: Element;
  reviewIdentity: string;
}

export interface ComponentResultTargets {
  readonly targets: readonly ResultTarget[];
}

function firstElement(handle: FieldCandidateHandle): Element | undefined {
  return handle.elements[0] ?? handle.customElements?.[0];
}

function reviewIdentity(item: ReviewPlanItem): string {
  return JSON.stringify([
    item.candidateId,
    item.profileFieldKey,
    item.profileEntryId,
    item.itemIndex,
    item.analysis?.mappingStatus,
    item.analysis?.valueBinding,
    item.analysis?.writePlan,
    item.status,
    item.selected,
    item.disabled,
  ]);
}

/** Capture reviewed identities before React can replace an input node. */
export function captureComponentResultTargets(
  registry: CandidateRegistry,
  items: readonly ReviewPlanItem[],
): ComponentResultTargets {
  const targets: ResultTarget[] = [];
  for (const item of items) {
    if (item.analysis?.mappingStatus !== "ADAPTER_VERIFIED") continue;
    const lookup = registry.lookupField(item.candidateId);
    if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
    const handle = lookup.handle;
    const element = firstElement(handle);
    const domName = handle.candidate.domName;
    if (!element || !domName) continue;
    const row =
      handle.itemGroupId !== undefined
        ? (element.closest(componentSelector(element, "row")) ?? undefined)
        : undefined;
    if (handle.itemGroupId !== undefined && !row) continue;
    targets.push({
      candidateId: item.candidateId,
      domName,
      element: handle.candidate.element,
      control: handle.candidate.control,
      tagName: element.tagName,
      inputType: element.getAttribute("type") ?? "",
      itemGroupId: handle.itemGroupId,
      itemIndex: handle.itemIndex,
      rowCount: handle.candidate.semanticContext?.repeat?.rowCount,
      row,
      rowContainer: row?.parentElement ?? undefined,
      reviewIdentity: reviewIdentity(item),
    });
  }
  return { targets };
}

/** Read-only registry: reviewed IDs are rebound only to one unambiguous live field. */
export function recollectComponentResultRegistry(
  document: Document,
  captured: ComponentResultTargets,
  items: readonly ReviewPlanItem[],
): CandidateRegistry {
  return collectComponentResultResolver(document)(captured, items);
}

/** Reuse one collection only within a synchronous, read-only result pass. */
export function collectComponentResultResolver(document: Document) {
  const fresh = collectFieldsSnapshot(document);
  const candidates = fresh.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((row) => row.fields),
  ]);
  const byName = new Map<string, FieldCandidateHandle[]>();
  for (const candidate of candidates) {
    if (!candidate.domName) continue;
    const lookup = fresh.registry.lookupField(candidate.candidateId);
    if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
    byName.set(candidate.domName, [
      ...(byName.get(candidate.domName) ?? []),
      lookup.handle,
    ]);
  }
  return (
    captured: ComponentResultTargets,
    items: readonly ReviewPlanItem[],
  ): CandidateRegistry => {
    const byId = new Map(items.map((item) => [item.candidateId, item]));
    const originalNames = new Map<string, number>();
    for (const target of captured.targets)
      originalNames.set(
        target.domName,
        (originalNames.get(target.domName) ?? 0) + 1,
      );
    const registry = new CandidateRegistry();
    for (const target of captured.targets) {
      const item = byId.get(target.candidateId);
      const matches = byName.get(target.domName) ?? [];
      if (
        !item ||
        reviewIdentity(item) !== target.reviewIdentity ||
        originalNames.get(target.domName) !== 1 ||
        matches.length !== 1
      )
        continue;
      const handle = matches[0]!;
      const element = firstElement(handle);
      const liveRow = element?.closest(componentSelector(element, "row"));
      if (
        !element ||
        handle.candidate.element !== target.element ||
        handle.candidate.control !== target.control ||
        element.tagName !== target.tagName ||
        (element.getAttribute("type") ?? "") !== target.inputType ||
        handle.itemGroupId !== target.itemGroupId ||
        handle.itemIndex !== target.itemIndex ||
        handle.candidate.semanticContext?.repeat?.rowCount !==
          target.rowCount ||
        (target.row !== undefined &&
          (target.row.isConnected
            ? liveRow !== target.row
            : !target.rowContainer?.isConnected ||
              liveRow?.parentElement !== target.rowContainer))
      )
        continue;
      registry.registerField({
        ...handle,
        candidateId: target.candidateId,
        candidate: { ...handle.candidate, candidateId: target.candidateId },
      });
    }
    return registry;
  };
}
