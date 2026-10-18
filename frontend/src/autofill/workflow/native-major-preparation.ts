import type { Profile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { collectPreparationSnapshot } from "../dom/collect";
import type { FieldCandidateHandle } from "../dom/types";
import { currentNativeOwner } from "../policy/native-form-collection";
import { nativeNestedRows } from "../policy/native-form-nested";
import {
  nativeProfileAssignment,
  nativeRepeatableProfileCount,
} from "../policy/native-form-row-assignment";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import { resolveValueBinding } from "../profile/value-binding";
import type { ReviewPlanItem } from "../review/review-plan";

export type NativeMajorPreparationState = {
  attempted: WeakSet<Element>;
  unavailable: ReviewPlanItem[];
};

/** Each committed school gets one follow-up preparation, within the existing run. */
export async function prepareNativeMajorsAfterSchool({
  document,
  profile,
  handles,
  state,
  apiClient,
  signal,
  beforeMutation,
}: {
  document: Document;
  profile: Profile;
  handles: FieldCandidateHandle[];
  state: NativeMajorPreparationState;
  apiClient: AnalysisApiClient;
  signal: AbortSignal;
  beforeMutation: () => Promise<boolean>;
}): Promise<void> {
  const targets = handles.flatMap((handle) => {
    const owner = currentNativeOwner(handle);
    if (
      !owner?.section.nested ||
      !owner.field.search ||
      owner.field.nestedIndex !== undefined ||
      state.attempted.has(owner.row)
    )
      return [];
    const index = nativeProfileAssignment(handle, profile);
    if (typeof index !== "number") return [];
    state.attempted.add(owner.row);
    const id = owner.section.nested.action.idPrefix + owner.index;
    const required = nativeRepeatableProfileCount(document, id, profile);
    const children = nativeNestedRows(owner.row, owner.section, owner.index!);
    return required && children && required > children.length
      ? [{ handle, owner, index, id, required }]
      : [];
  });
  if (!targets.length || signal.aborted) return;
  const current = () =>
    !signal.aborted &&
    targets.every((t) => currentNativeOwner(t.handle)?.row === t.owner.row);
  const snapshot = collectPreparationSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((s) =>
    (s.items ?? []).flatMap((i) => i.actionCandidates),
  );
  const allowed = new Map(
    candidates.flatMap((a) => {
      const target = targets.find((t) => t.id === a.domId);
      return target ? [[a.candidateId, target.required] as const] : [];
    }),
  );
  const executableSnapshot = (
    s: ReturnType<typeof collectPreparationSnapshot>,
  ): PreparationSnapshot => ({
    registry: s.registry,
    isTargetSectionVisible: s.isSectionVisible,
    countRepeatableGroups: (p) => s.countRepeatableGroups(p.actionCandidateId),
    repeatableGroupState: (p) => s.repeatableGroupState(p.actionCandidateId),
  });
  if (allowed.size) {
    const analysis = await apiClient.analyzePreparation(snapshot.request);
    if (!current() || !(await beforeMutation())) return;
    if (
      analysis.mode !== "ADAPTER" ||
      analysis.analysisStatus !== "COMPLETE" ||
      analysis.snapshotId !== snapshot.request.snapshotId
    )
      throw new Error("Unexpected major preparation response");
    const seen = new Set<string>();
    const plans = analysis.preparationPlans.flatMap((plan) => {
      const count = allowed.get(plan.actionCandidateId);
      if (
        plan.command !== "ADD_REPEATABLE_GROUP" ||
        count === undefined ||
        seen.has(plan.actionCandidateId)
      )
        return [];
      seen.add(plan.actionCandidateId);
      return [{ plan, approved: true, localItemCount: count }];
    });
    if (plans.length) {
      const result = await executeApprovedPreparationPlans({
        document,
        signal,
        beforeMutation,
        assertCurrent: current,
        approvedPlans: plans,
        initialSnapshot: executableSnapshot(snapshot),
        refreshSnapshot: async () =>
          executableSnapshot(collectPreparationSnapshot(document)),
        countRepeatableGroups: (s, p) => s.countRepeatableGroups?.(p) ?? -1,
      });
      if (result.status !== "completed")
        throw new Error("Major preparation failed");
    }
  }
  if (!current()) return;
  for (const { owner, index, required } of targets) {
    const children = nativeNestedRows(owner.row, owner.section, owner.index!);
    if (!children) throw new Error("Major rows changed");
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
      state.unavailable.push({
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
        reason: "입력 불가(학교 확정 후 다시 실행)",
        failureCode: "NESTED_MAJOR_NOT_READY",
      });
    }
  }
}
