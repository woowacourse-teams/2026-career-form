import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { ReviewPlanItem } from "../review/review-plan";
import { resultFieldLabel } from "./result-label";

export function pendingResultPresentation(item?: ReviewPlanItem) {
  const key =
    item?.analysis?.valueBinding?.profileFieldKey ??
    item?.profileFieldKey ??
    item?.analysis?.profileFieldKey;
  const [keyCategory, sectionId, fieldId] = key?.split(".") ?? [];
  const binding = item?.analysis?.valueBinding;
  const categoryId =
    keyCategory ??
    (binding?.type === "DERIVED" && binding.recipe.includes("FULL_NAME")
      ? "personal"
      : undefined);
  const category = PROFILE_CATEGORIES.find((entry) => entry.id === categoryId);
  const section = category?.sections.find((entry) => entry.id === sectionId);
  const topLevel = category?.topLevelFields?.some(
    (field) => field.id === fieldId,
  );
  const label = item
    ? resultFieldLabel({ ...item, profileFieldKey: key })
    : "입력 필드";
  const prefix = section ? `${section.label.replaceAll("·", "/")} / ` : "";
  return {
    category: (
      (category && category.sections.length > 1 && !topLevel
        ? section?.label
        : undefined) ??
      category?.label ??
      "기타 항목"
    ).replaceAll("·", "/"),
    label,
    shortLabel: !item
      ? "프로필 정보"
      : prefix && label.startsWith(prefix)
        ? label.slice(prefix.length)
        : label,
    sensitive: category?.sensitive === true || item?.status === "sensitive",
  };
}
