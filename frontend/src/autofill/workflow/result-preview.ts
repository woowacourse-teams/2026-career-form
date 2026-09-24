import type { Profile, ProfileCategoryId } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveValueBinding } from "../profile/value-binding";

export function resultPreview(
  item: ReviewPlanItem,
  profile?: Profile,
): string[] {
  return savedResultValues(item, profile).map(({ value, sensitive }) =>
    sensitive && !item.revealed ? "••••••••" : value,
  );
}

export function savedResultValues(
  item: ReviewPlanItem,
  profile?: Profile,
): { value: string; sensitive: boolean }[] {
  if (item.profileValue?.trim())
    return [
      { value: item.profileValue, sensitive: item.status === "sensitive" },
    ];
  if (!profile) return [];
  const key = item.profileFieldKey ?? item.analysis?.profileFieldKey;
  const binding =
    item.analysis?.valueBinding ??
    (key ? { type: "DIRECT" as const, profileFieldKey: key } : undefined);
  if (!binding) return [];
  const [category, section] = binding.profileFieldKey?.split(".") ?? [];
  const entries = profile[category as ProfileCategoryId];
  const count = Array.isArray(entries)
    ? entries.filter((entry) => entry.sectionId === section).length
    : 1;
  const values = Array.from({ length: count }, (_, index) => {
    const resolved = resolveValueBinding(
      profile,
      binding,
      item.itemIndex ?? index,
    );
    return resolved.status !== "resolved" && binding.profileFieldKey
      ? resolveValueBinding(
          profile,
          { type: "DIRECT", profileFieldKey: binding.profileFieldKey },
          item.itemIndex ?? index,
        )
      : resolved;
  }).flatMap((resolved) =>
    resolved.status === "resolved"
      ? [{ value: resolved.value, sensitive: resolved.sensitive }]
      : [],
  );
  return values.filter(
    (entry, index) =>
      values.findIndex((other) => other.value === entry.value) === index,
  );
}
