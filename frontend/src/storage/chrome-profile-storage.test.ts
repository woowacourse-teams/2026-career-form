import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile, PROFILE_SCHEMA_VERSION } from "../profile/model";
import {
  ChromeProfileStorage,
  LAYOUT_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
} from "./chrome-profile-storage";

function createStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  return {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
  };
}

describe("ChromeProfileStorage", () => {
  it("returns an empty profile when local storage has no profile", async () => {
    const repository = new ChromeProfileStorage(createStorage());

    await expect(repository.load()).resolves.toEqual(createEmptyProfile());
  });

  it("stores a sanitized versioned envelope and restores it", async () => {
    const storage = createStorage();
    const repository = new ChromeProfileStorage(storage);
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "  비식별 이름  ";

    await repository.save(profile);

    expect(storage.set).toHaveBeenCalledWith({
      [PROFILE_STORAGE_KEY]: {
        schemaVersion: PROFILE_SCHEMA_VERSION,
        profile: {
          ...createEmptyProfile(),
          personal: { koreanGivenName: "비식별 이름" },
        },
      },
    });
    await expect(repository.load()).resolves.toEqual({
      ...createEmptyProfile(),
      personal: { koreanGivenName: "비식별 이름" },
    });
  });

  it("rejects an unsupported schema without overwriting it", async () => {
    const storage = createStorage({
      [PROFILE_STORAGE_KEY]: { schemaVersion: 999, profile: {} },
    });
    const repository = new ChromeProfileStorage(storage);

    await expect(repository.load()).rejects.toThrow(
      "지원하지 않는 프로필 버전",
    );
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("rejects a malformed profile even when its schema version matches", async () => {
    const storage = createStorage({
      [PROFILE_STORAGE_KEY]: {
        schemaVersion: PROFILE_SCHEMA_VERSION,
        profile: { personal: { koreanFamilyName: 123 } },
      },
    });
    const repository = new ChromeProfileStorage(storage);

    await expect(repository.load()).rejects.toThrow(
      "저장된 프로필 형식을 읽을 수 없습니다",
    );
  });

  it("propagates save failures", async () => {
    const storage = createStorage();
    storage.set.mockRejectedValueOnce(new Error("storage unavailable"));
    const repository = new ChromeProfileStorage(storage);

    await expect(repository.save(createEmptyProfile())).rejects.toThrow(
      "storage unavailable",
    );
  });

  it("keeps layout preference separate and defaults to layout A", async () => {
    const storage = createStorage();
    const repository = new ChromeProfileStorage(storage);

    await expect(repository.loadLayout()).resolves.toBe("a");
    await repository.saveLayout("b");

    expect(storage.set).toHaveBeenCalledWith({ [LAYOUT_STORAGE_KEY]: "b" });
    await expect(repository.loadLayout()).resolves.toBe("b");
  });
});
