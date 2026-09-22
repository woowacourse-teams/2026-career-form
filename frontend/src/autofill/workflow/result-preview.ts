import type { Profile, ProfileCategoryId } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import { resolveValueBinding } from "../profile/value-binding";

export function resultPreview(
  item: ReviewPlanItem,
  profile?: Profile,
): string[] {
  if (item.status === "sensitive" && !item.revealed) return ["••••••••"];
  if (item.status !== "unavailable" || !profile) return [item.previewValue];
  const key = item.profileFieldKey ?? item.analysis?.profileFieldKey;
  const binding =
    item.analysis?.valueBinding ??
    (key ? { type: "DIRECT" as const, profileFieldKey: key } : undefined);
  if (!binding) return [item.previewValue];
  const [category, section] = binding.profileFieldKey?.split(".") ?? [];
  const entries = profile[category as ProfileCategoryId];
  const count = Array.isArray(entries)
    ? entries.filter((entry) => entry.sectionId === section).length
    : 1;
  const values = Array.from({ length: count }, (_, index) =>
    resolveValueBinding(profile, binding, index),
  ).flatMap((resolved) =>
    resolved.status === "resolved"
      ? [resolved.sensitive && !item.revealed ? "••••••••" : resolved.value]
      : [],
  );
  return values.length ? [...new Set(values)] : [item.previewValue];
}
