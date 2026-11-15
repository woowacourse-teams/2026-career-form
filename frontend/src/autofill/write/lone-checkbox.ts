import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { normalizeDisplayName } from "./display-name";
import { EMPLOYMENT_STATUS_SYNONYMS } from "../../profile/standard-values";

/** A value saved under an older name of a fixed choice (퇴사 for 퇴직). */
function renamedChoice(key: string | undefined, value: string): string | undefined {
  if (key !== "careers.career.employmentStatus") return undefined;
  return Object.entries(EMPLOYMENT_STATUS_SYNONYMS).find(([, words]) =>
    words.includes(value.replace(/\s+/g, "")),
  )?.[0];
}

function sameOptionName(left: string, right: string): boolean {
  return normalizeDisplayName(left) === normalizeDisplayName(right);
}

/** Labels of the stored choices of a select-type profile field. */
function profileFieldChoices(key: string | undefined): string[] {
  const [categoryId, sectionId, fieldId] = key?.split(".") ?? [];
  const field = PROFILE_CATEGORIES.find(({ id }) => id === categoryId)
    ?.sections.find(({ id }) => id === sectionId)
    ?.fields.find(({ id }) => id === fieldId);
  return (field?.options ?? []).map((choice) =>
    typeof choice === "string" ? choice : choice.label,
  );
}

/** The label of the profile field's fixed choice stored under this id. */
function profileFieldChoiceLabel(
  key: string | undefined,
  value: string,
): string | undefined {
  const [categoryId, sectionId, fieldId] = key?.split(".") ?? [];
  const choice = PROFILE_CATEGORIES.find(({ id }) => id === categoryId)
    ?.sections.find(({ id }) => id === sectionId)
    ?.fields.find(({ id }) => id === fieldId)
    ?.options?.find(
      (option) => typeof option !== "string" && option.value === value,
    );
  return choice && typeof choice !== "string" ? choice.label : undefined;
}

/**
 * A lone checkbox named after one choice of the profile field, while the
 * stored value is another choice of that field: the box should stay unchecked.
 */
export function loneCheckboxOfOtherChoice(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
  value: string,
): HTMLInputElement | undefined {
  const [box] = handle.elements;
  if (
    handle.elements.length !== 1 ||
    !(box instanceof HTMLInputElement) ||
    box.type !== "checkbox"
  )
    return undefined;
  const label =
    box.labels?.length === 1
      ? box.labels[0]?.textContent
      : box.getAttribute("aria-label");
  const key = item.analysis?.valueBinding?.profileFieldKey ?? item.profileFieldKey;
  const choices = profileFieldChoices(key);
  const named = choices.filter((choice) => sameOptionName(label ?? "", choice));
  // A standard choice is stored by its id (attendance:day), shown by its label (주간).
  const storedLabel =
    profileFieldChoiceLabel(key, value) ?? renamedChoice(key, value) ?? value;
  const stored = choices.filter((choice) => sameOptionName(storedLabel, choice));
  return label && named.length === 1 && stored.length === 1 && named[0] !== stored[0]
    ? box
    : undefined;
}
