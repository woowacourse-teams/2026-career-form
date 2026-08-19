import {
  createEmptyProfile,
  type FieldValues,
  type LayoutPreference,
  type Profile,
  type ProfileCategoryId,
  type ProfileEntry,
  type RepeatedProfileCategoryId,
} from "./model";

export interface ProfileRepository {
  load(): Promise<Profile>;
  save(profile: Profile): Promise<void>;
  loadLayout(): Promise<LayoutPreference>;
  saveLayout(layout: LayoutPreference): Promise<void>;
}

export const REPEATED_CATEGORY_IDS: readonly RepeatedProfileCategoryId[] = [
  "education",
  "languages",
  "certifications",
  "projects",
  "health",
];

function sanitizeValues(values: FieldValues): FieldValues {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
}

function sanitizeEntries(entries: ProfileEntry[]): ProfileEntry[] {
  return entries.flatMap((entry) => {
    const values = sanitizeValues(entry.values);
    return Object.keys(values).length === 0 ? [] : [{ ...entry, values }];
  });
}

export function sanitizeProfile(profile: Profile): Profile {
  return {
    personal: sanitizeValues(profile.personal),
    contact: sanitizeValues(profile.contact),
    education: sanitizeEntries(profile.education),
    languages: sanitizeEntries(profile.languages),
    certifications: sanitizeEntries(profile.certifications),
    projects: sanitizeEntries(profile.projects),
    military: sanitizeValues(profile.military),
    veteran: sanitizeValues(profile.veteran),
    disability: sanitizeValues(profile.disability),
    health: sanitizeEntries(profile.health),
  };
}

export function countCompletedCategories(profile: Profile): number {
  const sanitized = sanitizeProfile(profile);
  return (Object.keys(createEmptyProfile()) as ProfileCategoryId[]).filter(
    (categoryId) => {
      const category = sanitized[categoryId];
      return Array.isArray(category)
        ? category.length > 0
        : Object.keys(category).length > 0;
    },
  ).length;
}

export function cloneProfile(profile: Profile): Profile {
  return structuredClone(profile);
}
