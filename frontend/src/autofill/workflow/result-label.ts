import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { ReviewPlanItem } from "../review/review-plan";

export function resultFieldLabel(item: ReviewPlanItem): string {
  const key =
    item.analysis?.valueBinding?.profileFieldKey ?? item.profileFieldKey;
  const [categoryId, sectionId, fieldId] = key?.split(".") ?? [];
  const category = PROFILE_CATEGORIES.find((entry) => entry.id === categoryId);
  const section = category?.sections.find((entry) => entry.id === sectionId);
  const topLevelField = category?.topLevelFields?.find(
    (entry) => entry.id === fieldId,
  );
  const field = section?.fields.find((entry) => entry.id === fieldId);
  let label = item.fieldLabel
    .replace(/\s*[*＊]\s*필수(?:항목)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (topLevelField) {
    label = topLevelField.label;
  } else if (field && section && category) {
    label =
      category.sections.length > 1 || item.status === "sensitive"
        ? `${section.label} / ${field.label}`
        : field.label;
    if (category.repeatable && item.itemIndex !== undefined) {
      label += ` (${item.itemIndex + 1})`;
    }
  } else if (item.status === "sensitive" && key) {
    label = "프로필 정보";
  }
  return (label || "입력 필드").replaceAll("·", "/");
}
