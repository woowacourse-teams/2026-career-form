import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileCategoryId,
  ProfileEntry,
  RepeatedProfileCategoryId,
} from "../../profile/model";
import type { ValueBinding } from "../api/types";
import {
  isStandardValueId,
  standardValueLabel,
} from "../../profile/standard-values";

export type ValueBindingResolution =
  | {
      status: "resolved";
      value: string;
      sensitive: boolean;
      profileEntryId?: string;
      standardValueId?: string;
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
  const field =
    section?.fields.find((candidate) => candidate.id === fieldId) ??
    category?.topLevelFields?.find((candidate) => candidate.id === fieldId);
  if (!category || !section || !field || field.id === "evidenceDocumentPath")
    return undefined;
  return {
    categoryId: category.id,
    sectionId: section.id,
    fieldId: field.id,
    visibleWhen: field.visibleWhen,
    sensitive: category.sensitive,
    repeatable: category.repeatable,
    topLevel:
      category.topLevelFields?.some(
        (candidate) => candidate.id === field.id,
      ) === true,
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
      ? {
          status: "resolved",
          value,
          sensitive: parts.sensitive,
          ...(isStandardValueId(value) ? { standardValueId: value } : {}),
        }
      : { status: "missing", sensitive: parts.sensitive };
  }
  const entries = (
    profile[parts.categoryId as RepeatedProfileCategoryId] as ProfileEntry[]
  ).filter((entry) => entry.sectionId === parts.sectionId);
  if (parts.topLevel) {
    const educationEntries = profile.education;
    const entry =
      educationEntries.find(
        (candidate) => candidate.sectionId === "university",
      ) ?? educationEntries[0];
    const value = entry?.values[parts.fieldId]?.trim();
    return value
      ? {
          status: "resolved",
          value,
          sensitive: parts.sensitive,
          profileEntryId: entry.id,
          ...(isStandardValueId(value) ? { standardValueId: value } : {}),
        }
      : { status: "missing", sensitive: parts.sensitive };
  }
  if (!entries.length) return { status: "missing", sensitive: parts.sensitive };
  if (itemIndex === undefined && entries.length > 1) {
    return { status: "ambiguous", sensitive: parts.sensitive };
  }
  const entry = entries[itemIndex ?? 0];
  if (
    entry &&
    parts.categoryId === "education" &&
    parts.sectionId === "university" &&
    parts.visibleWhen &&
    !parts.visibleWhen(entry.values)
  ) {
    return { status: "missing", sensitive: parts.sensitive };
  }
  const value = entry?.values[parts.fieldId]?.trim();
  return value
    ? {
        status: "resolved",
        value,
        sensitive: parts.sensitive,
        ...(itemIndex !== undefined ? { profileEntryId: entry.id } : {}),
        ...(isStandardValueId(value) ? { standardValueId: value } : {}),
      }
    : { status: "missing", sensitive: parts.sensitive };
}

function derivedValue(
  profile: Profile,
  binding: Extract<ValueBinding, { type: "DERIVED" }>,
  itemIndex?: number,
): ValueBindingResolution {
  const recipe = binding.recipe;
  if (recipe === "BOOLEAN_YN") {
    if (!binding.profileFieldKey)
      return { status: "unknown", sensitive: false };
    const source = directValue(profile, binding.profileFieldKey);
    if (source.status !== "resolved") return source;
    const normalized = source.value.normalize("NFKC").trim().toLowerCase();
    const value = ["예", "대상", "해당", "있음", "y", "yes", "true"].includes(
      normalized,
    )
      ? (binding.trueLabel ?? "Y")
      : ["아니오", "비대상", "비해당", "없음", "n", "no", "false"].includes(
            normalized,
          )
        ? (binding.falseLabel ?? "N")
        : undefined;
    return value
      ? { status: "resolved", value, sensitive: source.sensitive }
      : { status: "missing", sensitive: source.sensitive };
  }
  if (recipe === "YEAR_MONTH") {
    if (!binding.profileFieldKey)
      return { status: "unknown", sensitive: false };
    const source = directValue(profile, binding.profileFieldKey, itemIndex);
    if (source.status !== "resolved") return source;
    const match = source.value.trim().match(/^(\d{4}-\d{2})/);
    return match
      ? { status: "resolved", value: match[1], sensitive: source.sensitive }
      : { status: "missing", sensitive: source.sensitive };
  }
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

function lookupValue(
  profile: Profile,
  binding: Extract<ValueBinding, { type: "LOOKUP" | "BUTTON_OPTION" }>,
  itemIndex?: number,
): ValueBindingResolution {
  const source = directValue(profile, binding.profileFieldKey, itemIndex);
  if (source.status !== "resolved") return source;
  const value =
    binding.optionMap[source.value] ??
    binding.optionMap[standardValueLabel(source.value) ?? ""];
  return value
    ? {
        status: "resolved",
        value,
        sensitive: source.sensitive,
        ...(source.profileEntryId
          ? { profileEntryId: source.profileEntryId }
          : {}),
        ...(source.standardValueId
          ? { standardValueId: source.standardValueId }
          : {}),
      }
    : { status: "missing", sensitive: source.sensitive };
}

export function resolveValueBinding(
  profile: Profile,
  binding: ValueBinding,
  itemIndex?: number,
): ValueBindingResolution {
  if (binding.type === "DIRECT") {
    return directValue(profile, binding.profileFieldKey, itemIndex);
  }
  if (binding.type === "LOOKUP" || binding.type === "BUTTON_OPTION") {
    return lookupValue(profile, binding, itemIndex);
  }
  return derivedValue(profile, binding, itemIndex);
}
