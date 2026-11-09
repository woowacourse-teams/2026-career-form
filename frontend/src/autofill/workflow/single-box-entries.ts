import type { Profile, ProfileEntry } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import { recordOf } from "./row-save-fields";

/** Saved entries per "category.section", from row keys "category.section#index". */
export function savedEntryOffsets(
  savedKeys: ReadonlySet<string>,
): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const key of savedKeys) {
    const section = key.split("#")[0]!;
    offsets.set(section, (offsets.get(section) ?? 0) + 1);
  }
  return offsets;
}

/** Whether the profile stores an entry past the saved ones of any saved section. */
export function hasUnsavedEntries(
  profile: Profile,
  offsets: ReadonlyMap<string, number>,
): boolean {
  return [...offsets].some(([section, saved]) => {
    const [categoryId, sectionId] = section.split(".");
    const entries = (profile as unknown as Record<string, unknown>)[
      categoryId!
    ] as ProfileEntry[] | undefined;
    return (
      Array.isArray(entries) &&
      entries.filter((entry) => entry.sectionId === sectionId).length > saved
    );
  });
}

/**
 * An item bound to the next stored entry of a refilled single box. Its inputs
 * were written for an earlier entry, but this entry is not written yet.
 */
export function isNextBoxEntry(
  item: ReviewPlanItem,
  offsets: ReadonlyMap<string, number>,
  savedKeys: ReadonlySet<string>,
): boolean {
  const record = recordOf(item);
  return (
    record !== undefined &&
    offsets.get(record.key.split("#")[0]!) === item.itemIndex &&
    !savedKeys.has(record.key)
  );
}
