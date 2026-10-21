import type { Profile } from "../../profile/model";
import type { FieldCandidateHandle } from "../dom/types";
import { currentNativeOwner } from "../policy/native-form-collection";
import { nativeNestedRows } from "../policy/native-form-nested";
import {
  nativeProfileAssignment,
  nativeRepeatableProfileCount,
} from "../policy/native-form-row-assignment";
import { resolveValueBinding } from "../profile/value-binding";
import {
  reportUnavailable,
  type NativeMajorPreparationState,
} from "./native-major-preparation";

import { ROW_SEARCH_REASON } from "./native-dependent-rows";

/**
 * A school whose search did not commit never gets its additional major rows:
 * adding them would click under an unconfirmed school, and re-running after a
 * manual school pick does not add them either. Its profile majors beyond the
 * existing rows are reported as manual rows instead. Marking the row attempted
 * keeps a later preparation from adding them and dedupes across passes.
 */
export function reportNativeMajorsOfFailedSchools({
  document,
  profile,
  handles,
  state,
}: {
  document: Document;
  profile: Profile;
  handles: readonly FieldCandidateHandle[];
  state: NativeMajorPreparationState;
}): void {
  for (const handle of handles) {
    const owner = currentNativeOwner(handle);
    if (
      !owner?.section.nested ||
      !owner.field.search ||
      owner.field.nestedIndex !== undefined ||
      owner.index === undefined ||
      state.attempted.has(owner.row)
    )
      continue;
    const index = nativeProfileAssignment(handle, profile);
    if (typeof index !== "number") continue;
    state.attempted.add(owner.row);
    const required = nativeRepeatableProfileCount(
      document,
      owner.section.nested.action.idPrefix + owner.index,
      profile,
    );
    const children = nativeNestedRows(owner.row, owner.section, owner.index);
    if (!required || !children) continue;
    for (const field of owner.section.fields) {
      if (
        !field.search ||
        field.nestedIndex === undefined ||
        field.nestedIndex < children.length ||
        field.nestedIndex >= required
      )
        continue;
      const value = resolveValueBinding(profile, field.binding, index);
      if (value.status !== "resolved") continue;
      reportUnavailable(state, {
        candidateId: `native-missing-${owner.section.id}-${owner.index}-${field.nestedIndex}`,
        fieldLabel: field.label,
        profileFieldKey: field.binding.profileFieldKey,
        profileEntryId: value.profileEntryId,
        itemIndex: index,
        currentValue: "",
        profileValue: value.value,
        previewValue: value.value,
        status: "unavailable",
        selected: false,
        disabled: true,
        revealed: false,
        reason: ROW_SEARCH_REASON,
        failureCode: "ROW_SEARCH_UNCONFIRMED",
      });
    }
  }
}
