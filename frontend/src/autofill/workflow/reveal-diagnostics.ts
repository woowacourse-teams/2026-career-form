import type { Profile } from "../../profile/model";
import type { WorkflowAdapter, WorkflowDiagnostic } from "../adapters/workflow";
import {
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import { requiresSensitiveConfirmation } from "../profile/sensitive-confirmation";
import { sensitiveValueApproved } from "./review-actions";
import { progressCategory } from "./progress-model";
import { adapterProfileValue } from "./workflow-model";

export function collectRevealDiagnostics({
  adapter,
  document,
  profile,
  approvedSensitiveValues,
  recordOperation,
}: {
  adapter: WorkflowAdapter;
  document: Document;
  profile: Profile;
  approvedSensitiveValues: ReadonlyMap<string, string>;
  recordOperation: (element: Element, category: string) => void;
}): WorkflowDiagnostic[] {
  return adapter.revealSelections.map((selection) => {
    const resolved = resolveProfileFieldValue(
      profile,
      selection.profileFieldKey,
      selection.itemIndex,
    );
    if (
      requiresSensitiveConfirmation(
        selection.profileFieldKey,
        resolved.sensitive,
      ) &&
      !sensitiveValueApproved(
        approvedSensitiveValues,
        profile,
        selection.profileFieldKey,
      )
    )
      return { code: "PROFILE_NOT_SELECTED", count: 0 };
    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input[type='radio'], select",
      ),
    ].filter(
      (element) =>
        element.name === selection.domName ||
        element.name.startsWith(`${selection.domName}_`),
    );
    const state = (element: HTMLInputElement | HTMLSelectElement) =>
      element instanceof HTMLInputElement
        ? element.checked
        : element.selectedIndex;
    const before = new Map(
      controls.map((element) => [element, state(element)]),
    );
    const diagnostic = adapter.selectReveal(
      document,
      selection,
      resolved.status === "resolved"
        ? adapterProfileValue(
            adapter,
            selection.profileFieldKey,
            resolved.value,
          )
        : undefined,
    );
    controls
      .filter((element) => state(element) !== before.get(element))
      .forEach((element) =>
        recordOperation(
          element,
          progressCategory({
            profileFieldKey: selection.profileFieldKey,
          } as ReviewPlanItem),
        ),
      );
    return diagnostic;
  });
}
