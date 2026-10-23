import { browser } from "wxt/browser";
import { isProfileIdentity } from "../profile/profile-identity";

import {
  createEmptyProfile,
  PROFILE_SCHEMA_VERSION,
  type LayoutPreference,
  type Profile,
  type ProfileEnvelope,
} from "../profile/model";
import {
  sanitizeProfile,
  ProfileWriteConflictError,
  profilesEqual,
  type ProfileRepository,
} from "../profile/profile-repository";

export const PROFILE_STORAGE_KEY = "careerForm.profile";
export const LAYOUT_STORAGE_KEY = "careerForm.layout";

export interface StorageArea {
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
    isFieldValues(value.values) &&
    (value.identity === undefined || isProfileIdentity(value.identity))
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

export const PROFILE_WRITE_MESSAGE = "careerForm.profile.compareAndSave";

export class ChromeProfileStorage implements ProfileRepository {
  private readonly storage: StorageArea;
  private readonly direct: boolean;
  private baseline?: Profile;
  private writes: Promise<void> = Promise.resolve();

  constructor(storage?: StorageArea) {
    this.direct = storage !== undefined;
    this.storage = storage ?? (browser.storage.local as StorageArea);
  }

  async load(): Promise<Profile> {
    const stored = await this.storage.get(PROFILE_STORAGE_KEY);
    const envelope = parseEnvelope(stored[PROFILE_STORAGE_KEY]);
    const profile = envelope
      ? {
          ...createEmptyProfile(),
          ...structuredClone(envelope.profile),
          careers: envelope.profile.careers ?? [],
          publications: envelope.profile.publications ?? [],
          compensation: envelope.profile.compensation ?? {},
        }
      : createEmptyProfile();
    this.baseline = structuredClone(profile);
    return profile;
  }

  save(profile: Profile): Promise<void> {
    const next = sanitizeProfile(profile);
    const operation = this.writes
      .catch(() => undefined)
      .then(async () => {
        if (this.direct) {
          await this.writeDirect(next);
        } else {
          // Without a load, only an actually empty stored profile may be initialized.
          const expected = this.baseline ?? createEmptyProfile();
          if (!(await this.requestWrite(expected, next))) {
            throw new ProfileWriteConflictError();
          }
        }
        this.baseline = structuredClone(next);
      });
    this.writes = operation;
    return operation;
  }

  saveIfUnchanged(expected: Profile, profile: Profile): Promise<boolean> {
    const baseline = structuredClone(expected);
    const next = sanitizeProfile(profile);
    const operation = this.writes
      .catch(() => undefined)
      .then(async () => {
        let saved: boolean;
        if (this.direct) {
          // Injected storage is for the background queue and controlled tests only.
          saved = profilesEqual(await this.load(), baseline);
          if (saved) await this.writeDirect(next);
        } else {
          saved = await this.requestWrite(baseline, next);
        }
        if (saved) this.baseline = structuredClone(next);
        return saved;
      });
    this.writes = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async requestWrite(
    expected: Profile,
    next: Profile,
  ): Promise<boolean> {
    const response: unknown = await browser.runtime.sendMessage({
      type: PROFILE_WRITE_MESSAGE,
      expected,
      next,
    });
    if (isRecord(response) && response.status === "saved") return true;
    if (isRecord(response) && response.status === "conflict") return false;
    throw new Error("프로필을 저장하지 못했습니다. 다시 시도해 주세요.");
  }

  private async writeDirect(profile: Profile): Promise<void> {
    const envelope: ProfileEnvelope = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile,
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
