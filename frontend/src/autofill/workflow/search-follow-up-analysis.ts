import type { Profile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import type {
  CompletedSearchFollowUpsRef,
  GenericSearchFollowUp,
} from "./workflow-analysis-types";

type FieldsSnapshot = ReturnType<typeof collectFieldsSnapshot>;

export interface SearchFollowUpAnalysisOptions {
  reviewOnly?: boolean;
  searchFollowUp?: GenericSearchFollowUp;
}

export function searchFollowUpIsCurrent(
  followUp: GenericSearchFollowUp,
  profile: Profile,
  pageDocument: Document,
): boolean {
  const [categoryId, sectionId, fieldId, ...rest] =
    followUp.profileFieldKey.split(".");
  const category = categoryId
    ? profile[categoryId as keyof Profile]
    : undefined;
  const entry = Array.isArray(category)
    ? category.find(({ id }) => id === followUp.profileEntryId)
    : undefined;
  const binding = followUp.item.analysis?.valueBinding;
  return (
    followUp.valid &&
    rest.length === 0 &&
    !!sectionId &&
    !!fieldId &&
    entry?.sectionId === sectionId &&
    followUp.item.profileEntryId === followUp.profileEntryId &&
    followUp.item.profileValue === followUp.profileValue &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === followUp.profileFieldKey &&
    followUp.target.ownerDocument === pageDocument &&
    followUp.target.isConnected &&
    followUp.repeatRow.isConnected &&
    followUp.repeatRow.ownerDocument === pageDocument &&
    followUp.repeatRow.contains(followUp.target) &&
    followUp.target.value === followUp.actualValue &&
    followUp.controls.length > 0 &&
    followUp.controls.every(
      (control) =>
        control.ownerDocument === pageDocument &&
        control.isConnected &&
        !control.disabled &&
        followUp.repeatRow.contains(control),
    )
  );
}

export function completedSearchFollowUpsAreCurrent(
  followUps: readonly GenericSearchFollowUp[],
  profile: Profile,
  pageDocument: Document,
): boolean {
  return followUps.every((followUp) =>
    searchFollowUpIsCurrent(followUp, profile, pageDocument),
  );
}

export function completedSearchFollowUpsRefIsCurrent(
  followUps: CompletedSearchFollowUpsRef,
  profile: Profile,
  pageDocument: Document,
): boolean {
  return completedSearchFollowUpsAreCurrent(
    followUps.current,
    profile,
    pageDocument,
  );
}

function followUpCandidate(
  followUp: GenericSearchFollowUp,
  items: readonly ReviewPlanItem[],
  snapshot: FieldsSnapshot,
): ReviewPlanItem | undefined {
  const fields = snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  const controlsPresent = followUp.controls.every((control) =>
    fields.some((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        (lookup.status === "ready" || lookup.status === "blocked") &&
        lookup.handle.elements.includes(control)
      );
    }),
  );
  if (!controlsPresent) return undefined;
  const matches = items.filter((item) => {
    const lookup = snapshot.registry.lookupField(item.candidateId);
    const binding = item.analysis?.valueBinding;
    return (
      item.profileEntryId === followUp.profileEntryId &&
      item.profileFieldKey === followUp.profileFieldKey &&
      item.profileValue === followUp.profileValue &&
      item.currentValue === followUp.actualValue &&
      binding?.type === "DIRECT" &&
      binding.profileFieldKey === followUp.profileFieldKey &&
      (lookup.status === "ready" || lookup.status === "blocked") &&
      lookup.handle.elements[0] === followUp.target &&
      followUp.repeatRow.contains(lookup.handle.elements[0])
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function currentSearchFollowUps(
  completed: CompletedSearchFollowUpsRef | undefined,
  pending: GenericSearchFollowUp | undefined,
): readonly GenericSearchFollowUp[] {
  const current = completed?.current ?? [];
  return pending
    ? [
        ...current.filter((followUp) => followUp.target !== pending.target),
        pending,
      ]
    : current;
}

export function rebindSearchFollowUps(
  followUps: readonly GenericSearchFollowUp[],
  items: readonly ReviewPlanItem[],
  snapshot: FieldsSnapshot,
  completed: CompletedSearchFollowUpsRef | undefined,
): readonly ReviewPlanItem[] | undefined {
  const rebound = followUps.map((followUp) => ({
    followUp,
    item: followUpCandidate(followUp, items, snapshot),
  }));
  if (rebound.some(({ item }) => !item)) return undefined;
  const resolved = rebound.map(({ followUp, item }) => {
    followUp.reboundCandidateId = item!.candidateId;
    return item!;
  });
  if (completed) {
    completed.current = followUps;
  }
  return resolved;
}

export function missingFollowUpGrade(
  followUp: GenericSearchFollowUp,
  profile: Profile,
  items: readonly ReviewPlanItem[],
  snapshot: FieldsSnapshot,
): boolean {
  return followUp.controls.some((control) => {
    const description = [
      control.name,
      control.id,
      control.getAttribute("aria-label"),
      ...Array.from(control.labels ?? []).map((label) => label.textContent),
    ]
      .filter(Boolean)
      .join(" ");
    if (!/grade|등급|급수/i.test(description)) return false;
    const [categoryId, sectionId, fieldId] =
      followUp.profileFieldKey.split(".");
    const category = categoryId
      ? profile[categoryId as keyof Profile]
      : undefined;
    const entry = Array.isArray(category)
      ? category.find(({ id }) => id === followUp.profileEntryId)
      : undefined;
    if (
      sectionId &&
      fieldId &&
      entry?.sectionId === sectionId &&
      !entry.values[fieldId]
    )
      return true;
    const field = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .find((candidate) => {
        const lookup = snapshot.registry.lookupField(candidate.candidateId);
        return (
          (lookup.status === "ready" || lookup.status === "blocked") &&
          lookup.handle.elements.includes(control)
        );
      });
    const item =
      field &&
      items.find(({ candidateId }) => candidateId === field.candidateId);
    return !item || item.status === "unavailable" || !item.profileValue;
  });
}
