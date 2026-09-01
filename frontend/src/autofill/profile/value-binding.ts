import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileCategoryId,
  ProfileEntry,
  RepeatedProfileCategoryId,
} from "../../profile/model";
import type { ValueBinding } from "../api/types";

export type ValueBindingResolution =
  | {
      status: "resolved";
      value: string;
      sensitive: boolean;
      profileEntryId?: string;
    }
  | { status: "missing"; sensitive: boolean }
  | { status: "ambiguous"; sensitive: boolean }
  | { status: "unknown"; sensitive: false };

function partsOf(key: string) {
  const [categoryId, sectionId, fieldId, ...rest] = key.split(".");
  if (rest.length || !categoryId || !sectionId || !fieldId) return undefined;
  const category = PROFILE_CATEGORIES.find(
    (candidate) => candidate.id === categoryId,
  );
  const section = category?.sections.find(
    (candidate) => candidate.id === sectionId,
  );
  const field = section?.fields.find((candidate) => candidate.id === fieldId);
  if (!category || !section || !field || field.id === "evidenceDocumentPath")
    return undefined;
  return {
    categoryId: category.id,
    sectionId: section.id,
    fieldId: field.id,
    sensitive: category.sensitive,
    repeatable: category.repeatable,
  };
}

function directValue(
  profile: Profile,
  key: string,
  itemIndex?: number,
): ValueBindingResolution {
  const parts = partsOf(key);
  if (!parts) return { status: "unknown", sensitive: false };
  if (!parts.repeatable) {
    const value = (profile[parts.categoryId] as FieldValues)[
      parts.fieldId
    ]?.trim();
    return value
      ? { status: "resolved", value, sensitive: parts.sensitive }
      : { status: "missing", sensitive: parts.sensitive };
  }
  const entries = (
    profile[parts.categoryId as RepeatedProfileCategoryId] as ProfileEntry[]
  ).filter((entry) => entry.sectionId === parts.sectionId);
  if (!entries.length) return { status: "missing", sensitive: parts.sensitive };
  if (itemIndex === undefined && entries.length > 1) {
    return { status: "ambiguous", sensitive: parts.sensitive };
  }
  const entry = entries[itemIndex ?? 0];
  const value = entry?.values[parts.fieldId]?.trim();
  return value
    ? {
        status: "resolved",
        value,
        sensitive: parts.sensitive,
        ...(itemIndex !== undefined ? { profileEntryId: entry.id } : {}),
      }
    : { status: "missing", sensitive: parts.sensitive };
}

function derivedValue(
  profile: Profile,
  recipe: NonNullable<Extract<ValueBinding, { type: "DERIVED" }>["recipe"]>,
): ValueBindingResolution {
  const family = profile.personal.koreanFamilyName?.trim();
  const given = profile.personal.koreanGivenName?.trim();
  const englishFamily = profile.personal.englishFamilyName?.trim();
  const englishGiven = profile.personal.englishGivenName?.trim();
  const value =
    recipe === "KOREAN_FULL_NAME"
      ? family && given
        ? `${family}${given}`
        : undefined
      : recipe === "ENGLISH_FULL_NAME_GIVEN_FIRST"
        ? englishFamily && englishGiven
          ? `${englishGiven} ${englishFamily}`
          : undefined
        : englishFamily && englishGiven
          ? `${englishFamily} ${englishGiven}`
          : undefined;
  return value
    ? { status: "resolved", value, sensitive: false }
    : { status: "missing", sensitive: false };
}

export function resolveValueBinding(
  profile: Profile,
  binding: ValueBinding,
  itemIndex?: number,
): ValueBindingResolution {
  return binding.type === "DIRECT"
    ? directValue(profile, binding.profileFieldKey, itemIndex)
    : derivedValue(profile, binding.recipe);
}
