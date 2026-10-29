import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileEntry,
} from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";

export interface AppearableProfileItem {
  key: string;
  itemIndex: number;
  categoryLabel: string;
  label: string;
  value: string;
}

const scopeKey = (key: string, itemIndex: number) => `${key}#${itemIndex}`;

function profileKeyOf(item: ReviewPlanItem): string | undefined {
  const binding = item.analysis?.valueBinding;
  return (
    item.profileFieldKey ??
    (binding && "profileFieldKey" in binding ? binding.profileFieldKey : undefined)
  );
}

/**
 * Stored values of the categories the first review showed that no visible
 * field covers yet. Only these may be written later without a second review.
 */
export function appearableProfileItems(
  profile: Profile,
  reviewItems: readonly ReviewPlanItem[],
): AppearableProfileItem[] {
  const covered = new Set(
    reviewItems.flatMap((item) => {
      const key = profileKeyOf(item);
      return key ? [scopeKey(key, item.itemIndex ?? 0)] : [];
    }),
  );
  const shownCategories = new Set(
    reviewItems.flatMap((item) => {
      const key = profileKeyOf(item);
      return key && !item.hiddenFromReview ? [key.split(".")[0]] : [];
    }),
  );
  const items: AppearableProfileItem[] = [];
  for (const category of PROFILE_CATEGORIES) {
    if (!shownCategories.has(category.id)) continue;
    const stored = (profile as unknown as Record<string, unknown>)[category.id];
    for (const section of category.sections) {
      const entries: { values: FieldValues; itemIndex: number }[] =
        category.repeatable
          ? ((stored as ProfileEntry[] | undefined) ?? [])
              .filter((entry) => entry.sectionId === section.id)
              .map((entry, itemIndex) => ({ values: entry.values, itemIndex }))
          : [{ values: (stored as FieldValues | undefined) ?? {}, itemIndex: 0 }];
      for (const { values, itemIndex } of entries)
        for (const field of section.fields) {
          const value = values[field.id]?.trim();
          const key = `${category.id}.${section.id}.${field.id}`;
          if (!value || covered.has(scopeKey(key, itemIndex))) continue;
          items.push({
            key,
            itemIndex,
            categoryLabel: category.label,
            label: field.label,
            value,
          });
        }
    }
  }
  return items.sort((a, b) =>
    scopeKey(a.key, a.itemIndex).localeCompare(scopeKey(b.key, b.itemIndex)),
  );
}

export function preApprovalKeyOf(item: ReviewPlanItem): string | undefined {
  const key = profileKeyOf(item);
  return key ? scopeKey(key, item.itemIndex ?? 0) : undefined;
}

export function preApprovalScope(
  items: readonly AppearableProfileItem[],
): ReadonlySet<string> {
  return new Set(items.map(({ key, itemIndex }) => scopeKey(key, itemIndex)));
}

/** An empty, AUTO-graded revealed field whose key and entry were approved. */
export function isPreApprovedItem(
  item: ReviewPlanItem,
  scope: ReadonlySet<string>,
): boolean {
  const key = profileKeyOf(item);
  return (
    item.genericGrade === "AUTO" &&
    item.status === "available" &&
    !item.disabled &&
    !item.currentValue.trim() &&
    key !== undefined &&
    scope.has(scopeKey(key, item.itemIndex ?? 0))
  );
}
