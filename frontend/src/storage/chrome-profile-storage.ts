import { browser } from "wxt/browser";

import {
  createEmptyProfile,
  PROFILE_SCHEMA_VERSION,
  type LayoutPreference,
  type Profile,
  type ProfileEnvelope,
} from "../profile/model";
import {
  sanitizeProfile,
  type ProfileRepository,
} from "../profile/profile-repository";

export const PROFILE_STORAGE_KEY = "careerForm.profile";
export const LAYOUT_STORAGE_KEY = "careerForm.layout";

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldValues(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every((field) => typeof field === "string")
  );
}

function isProfileEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.sectionId === "string" &&
    value.sectionId.length > 0 &&
    isFieldValues(value.values)
  );
}

function isProfile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const singleCategories = [
    "personal",
    "contact",
    "military",
    "veteran",
    "disability",
  ];
  const repeatedCategories = [
    "education",
    "languages",
    "certifications",
    "projects",
    "health",
  ];
  return (
    singleCategories.every((category) => isFieldValues(value[category])) &&
    repeatedCategories.every(
      (category) =>
        Array.isArray(value[category]) && value[category].every(isProfileEntry),
    )
  );
}

function parseEnvelope(value: unknown): ProfileEnvelope | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error("지원하지 않는 프로필 버전입니다.");
  }
  if (!isProfile(value.profile)) {
    throw new Error("저장된 프로필 형식을 읽을 수 없습니다.");
  }
  return value as unknown as ProfileEnvelope;
}

export class ChromeProfileStorage implements ProfileRepository {
  constructor(
    private readonly storage: StorageArea = browser.storage
      .local as StorageArea,
  ) {}

  async load(): Promise<Profile> {
    const stored = await this.storage.get(PROFILE_STORAGE_KEY);
    const envelope = parseEnvelope(stored[PROFILE_STORAGE_KEY]);
    return envelope ? structuredClone(envelope.profile) : createEmptyProfile();
  }

  async save(profile: Profile): Promise<void> {
    const envelope: ProfileEnvelope = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile: sanitizeProfile(profile),
    };
    await this.storage.set({ [PROFILE_STORAGE_KEY]: envelope });
  }

  async loadLayout(): Promise<LayoutPreference> {
    const stored = await this.storage.get(LAYOUT_STORAGE_KEY);
    return stored[LAYOUT_STORAGE_KEY] === "b" ? "b" : "a";
  }

  async saveLayout(layout: LayoutPreference): Promise<void> {
    await this.storage.set({ [LAYOUT_STORAGE_KEY]: layout });
  }
}
