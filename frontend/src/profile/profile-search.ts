import { entryIdentity } from "./editor-presentation";
import {
  PROFILE_CATEGORIES,
  type ProfileCategoryDefinition,
  type ProfileFieldDefinition,
} from "./field-definitions";
import { fieldDisplayValue } from "./field-display";
import type {
  FieldValues,
  Profile,
  ProfileCategoryId,
  ProfileEntry,
} from "./model";

/** Which repeated record a value belongs to, titled like profile management cards. */
export interface ProfileSearchEntry {
  id: string;
  /** `${section label} ${position in the category}`, e.g. "대학교 2". */
  label: string;
  sectionLabel: string;
  /** The school, exam or certificate name a person recognizes the record by. */
  name?: string;
}

export interface ProfileSearchItem {
  id: string;
  categoryId: ProfileCategoryId;
  categoryLabel: string;
  fieldLabel: string;
  /** Shown and copied text: a coded choice reads as its option label. */
  value: string;
  sensitive: boolean;
  /** Present only for values of a repeated record such as a school. */
  entry?: ProfileSearchEntry;
}

export interface ProfileSearchBlock {
  entry?: ProfileSearchEntry;
  items: ProfileSearchItem[];
}

interface ItemSource {
  idPrefix: string;
  values: FieldValues;
  category: ProfileCategoryDefinition;
  fields: readonly ProfileFieldDefinition[];
  entry?: ProfileSearchEntry;
}

function itemsFromValues({
  idPrefix,
  values,
  category,
  fields,
  entry,
}: ItemSource): ProfileSearchItem[] {
  return fields.flatMap((field) => {
    const value = values[field.id]?.trim();
    return value
      ? [
          {
            id: `${idPrefix}-${field.id}`,
            categoryId: category.id,
            categoryLabel: category.label,
            fieldLabel: field.label,
            value: fieldDisplayValue(field, value, values),
            sensitive: category.sensitive,
            ...(entry ? { entry } : {}),
          },
        ]
      : [];
  });
}

function itemsFromEntry(
  entry: ProfileEntry,
  index: number,
  category: ProfileCategoryDefinition,
): ProfileSearchItem[] {
  const section =
    category.sections.find((candidate) => candidate.id === entry.sectionId) ??
    category.sections[0];
  const name = entryIdentity(entry);
  return itemsFromValues({
    idPrefix: `${category.id}-${entry.id}`,
    values: entry.values,
    category,
    fields: section.fields,
    entry: {
      id: entry.id,
      label: `${section.label} ${index + 1}`,
      sectionLabel: section.label,
      ...(name ? { name } : {}),
    },
  });
}

export function buildSearchItems(profile: Profile): ProfileSearchItem[] {
  return PROFILE_CATEGORIES.flatMap((category) => {
    const categoryValue = profile[category.id];
    if (Array.isArray(categoryValue)) {
      return categoryValue.flatMap((entry, index) =>
        itemsFromEntry(entry, index, category),
      );
    }
    return itemsFromValues({
      idPrefix: category.id,
      values: categoryValue,
      category,
      fields: category.sections[0].fields,
    });
  });
}

/** Splits items into runs of one repeated record; other values stand alone. */
export function groupItemsByEntry(
  items: readonly ProfileSearchItem[],
): ProfileSearchBlock[] {
  const blocks: ProfileSearchBlock[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    const lastItem = last?.items.at(-1);
    if (
      last?.entry &&
      item.entry &&
      lastItem?.categoryId === item.categoryId &&
      last.entry.id === item.entry.id
    ) {
      last.items.push(item);
    } else {
      blocks.push({ entry: item.entry, items: [item] });
    }
  }
  return blocks;
}

/** Matches category and field labels only; values and entry headings are never searched. */
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
