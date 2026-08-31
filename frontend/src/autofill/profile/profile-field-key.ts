import { PROFILE_CATEGORIES } from "../../profile/field-definitions";

const EXCLUDED_FIELD_IDS = new Set(["evidenceDocumentPath"]);

export function isAutofillProfileFieldKey(value: string): boolean {
  const [categoryId, sectionId, fieldId, ...rest] = value.split(".");
  if (rest.length > 0 || !categoryId || !sectionId || !fieldId) return false;

  return PROFILE_CATEGORIES.some(
    (category) =>
      category.id === categoryId &&
      category.sections.some(
        (section) =>
          section.id === sectionId &&
          section.fields.some(
            (field) =>
              field.id === fieldId && !EXCLUDED_FIELD_IDS.has(field.id),
          ),
      ),
  );
}
