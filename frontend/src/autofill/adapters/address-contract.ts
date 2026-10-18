import { executionPolicyForSite } from "../workflow/execution-policy";
import type { ActionCandidate, SiteDescriptor } from "../api/types";

export function isAddressSearchAction(
  site: SiteDescriptor,
  action: ActionCandidate,
): boolean {
  const identity = executionPolicyForSite(site)?.browserPolicy?.addressAction
    ? action.domId ===
        executionPolicyForSite(site)!.browserPolicy!.addressAction.domId &&
      (executionPolicyForSite(site)!.browserPolicy!.addressAction.domName
        ? action.domName ===
          executionPolicyForSite(site)!.browserPolicy!.addressAction.domName
        : !action.domName || action.domName === action.domId) &&
      action.element ===
        executionPolicyForSite(site)!.browserPolicy!.addressAction.element
    : !!executionPolicyForSite(site)?.componentPolicy &&
      action.domId ===
        executionPolicyForSite(site)!.componentPolicy!.addressAction &&
      !action.domName &&
      action.element === "button";
  return (
    identity &&
    action.control === "button" &&
    action.visibility === "visible" &&
    !action.disabled &&
    !action.readonly &&
    !action.inert
  );
}
