import {
  PROFILE_SCHEMA_VERSION,
  type FieldValues,
  type Profile,
  type ProfileEntry,
  type ProfileEnvelope,
} from "./model";
import { sanitizeProfile } from "./profile-repository";

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
    isFieldValues(value.values)
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
  return structuredClone(value.profile);
}

export function serializeProfileExport(profile: Profile): string {
  const envelope: ProfileEnvelope = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile: sanitizeProfile(profile),
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
