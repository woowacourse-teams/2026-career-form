import {
  PROFILE_SCHEMA_VERSION,
  type FieldValues,
  type Profile,
  type ProfileEntry,
  type ProfileEnvelope,
} from "./model";
import { PROFILE_CATEGORIES } from "./field-definitions";
import { sanitizeProfile } from "./profile-repository";
import { isProfileIdentity } from "./profile-identity";

const SINGLE_CATEGORY_IDS = [
  "personal",
  "contact",
  "compensation",
  "military",
  "veteran",
  "disability",
] as const;

const REPEATED_CATEGORY_IDS = [
  "education",
  "languages",
  "certifications",
  "careers",
  "projects",
  "publications",
  "health",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldValues(value: unknown): value is FieldValues {
  return (
    isRecord(value) &&
    Object.values(value).every((field) => typeof field === "string")
  );
}

function isProfileEntry(value: unknown): value is ProfileEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.sectionId === "string" &&
    value.sectionId.length > 0 &&
    isFieldValues(value.values) &&
    (value.identity === undefined || isProfileIdentity(value.identity))
  );
}

function isProfile(value: unknown): value is Profile {
  return (
    isRecord(value) &&
    SINGLE_CATEGORY_IDS.every((category) => isFieldValues(value[category])) &&
    REPEATED_CATEGORY_IDS.every(
      (category) =>
        Array.isArray(value[category]) && value[category].every(isProfileEntry),
    )
  );
}

function parseProfileEnvelope(value: unknown): Profile {
  if (!isRecord(value) || value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error("지원하지 않는 프로필 버전입니다.");
  }
  if (!isProfile(value.profile)) {
    throw new Error("저장된 프로필 형식을 읽을 수 없습니다.");
  }
  return withUniqueEntryIds(sanitizeProfile(structuredClone(value.profile)));
}

function withBlankFields(
  values: FieldValues,
  fieldIds: readonly string[],
): FieldValues {
  return {
    ...Object.fromEntries(fieldIds.map((id) => [id, ""])),
    ...values,
  };
}

function categoryDefinition(categoryId: string) {
  const category = PROFILE_CATEGORIES.find(({ id }) => id === categoryId);
  if (!category) {
    throw new Error(`알 수 없는 프로필 카테고리입니다: ${categoryId}`);
  }
  return category;
}

function entryFieldIds(
  categoryId: string,
  sectionId: string,
  includeTopLevel: boolean,
): string[] {
  const category = categoryDefinition(categoryId);
  const sectionFields =
    category.sections.find(({ id }) => id === sectionId)?.fields ?? [];
  const topLevelFields = includeTopLevel ? (category.topLevelFields ?? []) : [];
  return [...sectionFields, ...topLevelFields].map(({ id }) => id);
}

function withTemplateEntries(
  categoryId: string,
  entries: ProfileEntry[],
): ProfileEntry[] {
  if (entries.length === 0) {
    return categoryDefinition(categoryId).sections.map((section) => ({
      id: `template-${categoryId}-${section.id}`,
      sectionId: section.id,
      values: withBlankFields(
        {},
        entryFieldIds(categoryId, section.id, section.id === "university"),
      ),
    }));
  }
  return entries.map((entry) => ({
    ...entry,
    values: withBlankFields(
      entry.values,
      entryFieldIds(
        categoryId,
        entry.sectionId,
        entry.sectionId === "university",
      ),
    ),
  }));
}

function withTemplateFields(profile: Profile): Profile {
  const template: Profile = { ...profile };
  for (const categoryId of SINGLE_CATEGORY_IDS) {
    template[categoryId] = withBlankFields(
      profile[categoryId],
      categoryDefinition(categoryId).sections.flatMap(({ fields }) =>
        fields.map(({ id }) => id),
      ),
    );
  }
  for (const categoryId of REPEATED_CATEGORY_IDS) {
    template[categoryId] = withTemplateEntries(categoryId, profile[categoryId]);
  }
  return template;
}

function createEntryId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function withUniqueEntryIds(profile: Profile): Profile {
  const seen = new Set<string>();
  for (const categoryId of REPEATED_CATEGORY_IDS) {
    profile[categoryId] = profile[categoryId].map((entry) => {
      let id = entry.id;
      while (seen.has(id)) {
        id = createEntryId();
      }
      seen.add(id);
      return id === entry.id ? entry : { ...entry, id };
    });
  }
  return profile;
}

export function serializeProfileExport(profile: Profile): string {
  const envelope: ProfileEnvelope = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile: withTemplateFields(sanitizeProfile(profile)),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function parseProfileImport(json: string): Profile {
  try {
    return parseProfileEnvelope(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("가져오기 파일을 읽을 수 없습니다.");
    }
    throw error;
  }
}
