import type { ActionCandidate, SiteDescriptor } from "../api/types";

export function isAddressSearchAction(
  site: SiteDescriptor,
  action: ActionCandidate,
): boolean {
  const identity =
    site.host === "www.skcareers.com" &&
    site.pathPattern.startsWith("/Application/Index/")
      ? action.domId === "btnSearchAddress" &&
        (!action.domName || action.domName === "btnSearchAddress") &&
        action.element === "button"
      : site.host === "talent.hyundai.com" &&
          site.pathPattern === "/apply/applyWrite.hc"
        ? action.domId === "hyundai:search:address" &&
          action.domName === "postCd" &&
          action.element === "input"
        : false;
  return (
    identity &&
    action.control === "button" &&
    action.visibility === "visible" &&
    !action.disabled &&
    !action.readonly &&
    !action.inert
  );
}
