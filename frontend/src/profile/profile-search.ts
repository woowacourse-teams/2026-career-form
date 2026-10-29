import {
  PROFILE_CATEGORIES,
  type ProfileFieldDefinition,
} from "./field-definitions";
import { fieldDisplayValue } from "./field-display";
import type {
  FieldValues,
  Profile,
  ProfileCategoryId,
  ProfileEntry,
} from "./model";

export interface ProfileSearchItem {
  id: string;
  categoryId: ProfileCategoryId;
  categoryLabel: string;
  fieldLabel: string;
  /** Shown and copied text: a coded choice reads as its option label. */
  value: string;
  sensitive: boolean;
}

function itemsFromValues(
  idPrefix: string,
  values: FieldValues,
  categoryId: ProfileCategoryId,
  categoryLabel: string,
  sensitive: boolean,
  fields: readonly ProfileFieldDefinition[],
): ProfileSearchItem[] {
  return fields.flatMap((field) => {
    const value = values[field.id]?.trim();
    return value
      ? [
          {
            id: `${idPrefix}-${field.id}`,
            categoryId,
            categoryLabel,
            fieldLabel: field.label,
            value: fieldDisplayValue(field, value, values),
            sensitive,
          },
        ]
      : [];
  });
}

function itemsFromEntry(
  entry: ProfileEntry,
  category: (typeof PROFILE_CATEGORIES)[number],
): ProfileSearchItem[] {
  const section =
    category.sections.find((candidate) => candidate.id === entry.sectionId) ??
    category.sections[0];
  return itemsFromValues(
    `${category.id}-${entry.id}`,
    entry.values,
    category.id,
    category.label,
    category.sensitive,
    section.fields,
  );
}

export function buildSearchItems(profile: Profile): ProfileSearchItem[] {
  return PROFILE_CATEGORIES.flatMap((category) => {
    const categoryValue = profile[category.id];
    if (Array.isArray(categoryValue)) {
      return categoryValue.flatMap((entry) => itemsFromEntry(entry, category));
    }
    return itemsFromValues(
      category.id,
      categoryValue,
      category.id,
      category.label,
      category.sensitive,
      category.sections[0].fields,
    );
  });
}

export function searchProfileItems(
  items: readonly ProfileSearchItem[],
  query: string,
): ProfileSearchItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalizedQuery) return [...items];
  return items.filter((item) =>
    `${item.categoryLabel} ${item.fieldLabel}`
      .toLocaleLowerCase("ko-KR")
      .includes(normalizedQuery),
  );
}
