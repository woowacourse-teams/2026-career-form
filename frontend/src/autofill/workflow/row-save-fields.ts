import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { RowSaveField } from "../generic/row-save";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/write-result";
import { profileKeyOf } from "./pre-approval";

/** The repeated profile entry a field belongs to, for row saves (#370). */
export function recordOf(
  item: ReviewPlanItem,
): { key: string; label: string } | undefined {
  const [categoryId, sectionId] = profileKeyOf(item)?.split(".") ?? [];
  const category = PROFILE_CATEGORIES.find(({ id }) => id === categoryId);
  const section = category?.repeatable
    ? category.sections.find(({ id }) => id === sectionId)
    : undefined;
  if (!section) return undefined;
  const index = item.itemIndex ?? 0;
  return {
    key: `${categoryId}.${sectionId}#${index}`,
    label: `${section.label} ${index + 1}번째 줄`,
  };
}

export function rowSaveFields({
  items,
  approvedIds,
  passResults,
  registry,
  wasWritten,
}: {
  items: readonly ReviewPlanItem[];
  approvedIds: ReadonlySet<string>;
  /** Results of the pass that just ran. */
  passResults: readonly ApprovedWriteResult[];
  registry: CandidateRegistry;
  wasWritten(candidateId: string): boolean;
}): RowSaveField[] {
  const written = new Set(
    passResults
      .filter((result) => result.status === "written")
      .map((result) => result.candidateId),
  );
  const matched = new Set(
    passResults
      .filter(
        (result) =>
          result.status === "skipped" && result.code === "ALREADY_MATCHED",
      )
      .map((result) => result.candidateId),
  );
  const conflicted = new Set(
    passResults
      .filter(
        (result) => result.status === "skipped" && result.code === "CONFLICT",
      )
      .map((result) => result.candidateId),
  );
  // Sites fill dependent fields of a row from their own catalog right after a
  // search choice. An empty field that conflicted after a search in the same
  // row was filled that way; the extension keeps the site's value and it must
  // not block the row's save.
  const filledBySiteAfterSearch = (item: ReviewPlanItem, at: number) => {
    const key = recordOf(item)?.key;
    return (
      key !== undefined &&
      conflicted.has(item.candidateId) &&
      item.currentValue.trim() === "" &&
      items
        .slice(0, at)
        .some(
          (other) =>
            other.analysis?.writePlan?.command === "SEARCH_SELECTION" &&
            recordOf(other)?.key === key &&
            written.has(other.candidateId),
        )
    );
  };
  // A field the analysis left unmapped belongs to no entry: it neither
  // decides a row nor marks an area as another entry's.
  return items
    .map((item, at) => ({ item, at }))
    .filter(({ item }) => profileKeyOf(item) !== undefined)
    .map(({ item, at }) => {
      const lookup = registry.lookupField(item.candidateId);
      const record = recordOf(item);
      const id = item.candidateId;
      return {
        recordKey: record?.key,
        recordLabel: record?.label ?? "",
        elements: "handle" in lookup ? lookup.handle.elements : [],
        approved: approvedIds.has(id) || wasWritten(id),
        written: written.has(id),
        settled:
          written.has(id) ||
          matched.has(id) ||
          wasWritten(id) ||
          filledBySiteAfterSearch(item, at),
      };
    });
}
