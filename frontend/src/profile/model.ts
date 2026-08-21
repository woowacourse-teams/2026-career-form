export const PROFILE_SCHEMA_VERSION = 1 as const;

export type LayoutPreference = "a" | "b";

export type ProfileCategoryId =
  | "personal"
  | "contact"
  | "education"
  | "languages"
  | "certifications"
  | "projects"
  | "military"
  | "veteran"
  | "disability"
  | "health";

export type RepeatedProfileCategoryId =
  "education" | "languages" | "certifications" | "projects" | "health";

export type SingleProfileCategoryId = Exclude<
  ProfileCategoryId,
  RepeatedProfileCategoryId
>;

export type FieldValues = Record<string, string>;

export interface ProfileEntry {
  id: string;
  sectionId: string;
  values: FieldValues;
}

export interface Profile {
  personal: FieldValues;
  contact: FieldValues;
  education: ProfileEntry[];
  languages: ProfileEntry[];
  certifications: ProfileEntry[];
  projects: ProfileEntry[];
  military: FieldValues;
  veteran: FieldValues;
  disability: FieldValues;
  health: ProfileEntry[];
}

export interface ProfileEnvelope {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profile: Profile;
}

export function createEmptyProfile(): Profile {
  return {
    personal: {},
    contact: {},
    education: [],
    languages: [],
    certifications: [],
    projects: [],
    military: {},
    veteran: {},
    disability: {},
    health: [],
  };
}
