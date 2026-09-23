import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";

/** Only an explicit local control-to-region relation can trigger recollection. */
export function isGenericStateDriver(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  if (
    item.analysis?.mappingStatus !== "LLM_SUGGESTED" ||
    !["SELECT_OPTION", "CHECK_RADIO"].includes(
      item.analysis.writePlan?.command ?? "",
    )
  )
    return false;
  return genericControlledRegions(handle).length > 0;
}

export function genericControlledRegions(
  handle: FieldCandidateHandle,
): HTMLElement[] {
  return handle.elements.flatMap((element) => {
    const ids =
      element.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
    if (ids.length !== 1) return [];
    const target = element.ownerDocument.getElementById(ids[0]);
    return target instanceof HTMLElement &&
      !!target?.isConnected &&
      !target.contains(element) &&
      target.getAttribute("role") !== "listbox" &&
      !!target.querySelector("input:not([type='hidden']), select, textarea")
      ? [target]
      : [];
  });
}

export async function waitForGenericEffect(
  targets: readonly HTMLElement[],
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5 && !signal.aborted; attempt++) {
    if (
      targets.length &&
      targets.every((target) => {
        if (
          !target.isConnected ||
          target.closest("[hidden], [aria-hidden='true'], [inert]")
        )
          return false;
        let ancestor: HTMLElement | null = target;
        while (ancestor) {
          const style =
            target.ownerDocument.defaultView?.getComputedStyle(ancestor);
          if (style?.display === "none" || style?.visibility === "hidden")
            return false;
          ancestor = ancestor.parentElement;
        }
        return !!target.querySelector(
          "input:not([type='hidden']), select, textarea",
        );
      })
    )
      return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
