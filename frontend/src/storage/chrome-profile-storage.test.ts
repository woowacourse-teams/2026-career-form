import { ProfileWriteConflictError } from "../profile/profile-repository";
import { saveImportSelection } from "../profile/page-import/merge";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createProfileWriteHandler } from "./profile-write-handler";

const runtime = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { sendMessage: runtime.sendMessage },
    storage: { local: { get: runtime.get, set: runtime.set } },
  },
}));

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

describe("production profile writes", () => {
  beforeEach(() => {
    const storage = createStorage();
    runtime.get.mockImplementation(storage.get);
    runtime.set.mockImplementation(storage.set);
    const handle = createProfileWriteHandler(storage, "extension-id");
    runtime.sendMessage.mockImplementation((message) =>
      handle(message, { id: "extension-id" }),
    );
  });
  it("rejects a delayed options write after another context saves an import", async () => {
    const options = new ChromeProfileStorage();
    const importer = new ChromeProfileStorage();
    const draft = await options.load();
    const baseline = await importer.load();
    draft.contact.phoneNumber = "01012345678";
    await saveImportSelection(importer, baseline, {
      contact: { email: "import@example.invalid" },
      education: [],
    });
    await expect(options.save(draft)).rejects.toBeInstanceOf(
      ProfileWriteConflictError,
    );
    expect((await importer.load()).contact).toEqual({
      email: "import@example.invalid",
    });
  });
  it("queues same-instance saves and advances baseline only after success", async () => {
    const repository = new ChromeProfileStorage();
    const first = await repository.load();
    first.contact.email = "first@example.invalid";
    const next = structuredClone(first);
    next.contact.phoneNumber = "01012345678";
    await Promise.all([repository.save(first), repository.save(next)]);
    expect((await repository.load()).contact).toEqual(next.contact);
  });
  it("allows initial empty-profile save without an earlier load", async () => {
    const profile = createEmptyProfile();
    profile.contact.email = "initial@example.invalid";
    const repository = new ChromeProfileStorage();
    await repository.save(profile);
    expect((await repository.load()).contact.email).toBe(
      "initial@example.invalid",
    );
  });
});

it("refuses a new context's uninitialized save over an existing profile", async () => {
  const storage = createStorage();
  runtime.get.mockImplementation(storage.get);
  const handler = createProfileWriteHandler(storage, "extension-id");
  runtime.sendMessage.mockImplementation((message) =>
    handler(message, { id: "extension-id" }),
  );
  const first = new ChromeProfileStorage();
  const profile = createEmptyProfile();
  profile.contact.email = "first@example.invalid";
  await first.save(profile);
  const other = new ChromeProfileStorage();
  await expect(other.save(createEmptyProfile())).rejects.toThrow();
  expect((await first.load()).contact.email).toBe("first@example.invalid");
});

it("recovers the instance queue after a failed atomic write", async () => {
  const storage = createStorage();
  const repository = new ChromeProfileStorage(storage);
  const baseline = await repository.load();
  const next = createEmptyProfile();
  next.contact.email = "recovered@example.invalid";
  storage.set.mockRejectedValueOnce(new Error("synthetic failure"));
  await expect(repository.saveIfUnchanged(baseline, next)).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await repository.saveIfUnchanged(baseline, next)).toBe(true);
  expect((await repository.load()).contact.email).toBe(
    "recovered@example.invalid",
  );
});
