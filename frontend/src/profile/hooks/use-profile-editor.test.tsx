import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../model";
import {
  ProfileWriteConflictError,
  type ProfileRepository,
} from "../profile-repository";
import { useProfileEditor } from "./use-profile-editor";

function createRepository(): ProfileRepository {
  return {
    load: vi.fn(async () => createEmptyProfile()),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("useProfileEditor", () => {
  it("clears a selected identity when its name is edited without changing related fields", async () => {
    const profile = createEmptyProfile();
    profile.certifications = [
      {
        id: "certificate-1",
        sectionId: "certificate",
        values: {
          name: "SQL 개발자",
          registrationNo: "DEMO-1",
          issuer: "원래 기관",
        },
        identity: {
          status: "selected",
          catalogId: "certificate:sqld",
          displayName: "SQL 개발자",
          originalText: "SQLD",
          catalogVersion: "2026-10-07",
        },
      },
    ];
    const repository = createRepository();
    vi.mocked(repository.load).mockResolvedValue(profile);
    const { result } = renderHook(() => useProfileEditor(repository));
    await act(async () => Promise.resolve());

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL",
      ),
    );

    expect(result.current.profile.certifications[0]).toEqual({
      id: "certificate-1",
      sectionId: "certificate",
      values: { name: "SQL", registrationNo: "DEMO-1", issuer: "원래 기관" },
      identity: { status: "manual", originalText: "SQL" },
    });
  });

  it("autosaves a changed value and exposes saving then saved status", async () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useProfileEditor(repository, 300));

    await act(async () => Promise.resolve());
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", " 김 "),
    );
    expect(result.current.saveStatus).toBe("saving");

    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ personal: { koreanFamilyName: " 김 " } }),
    );
    expect(result.current.saveStatus).toBe("saved");
    vi.useRealTimers();
  });

  it("keeps the edited value after a failure and retries the latest profile", async () => {
    vi.useFakeTimers();
    const repository = createRepository();
    vi.mocked(repository.save)
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProfileEditor(repository, 100));

    await act(async () => Promise.resolve());
    act(() =>
      result.current.updateSingle("contact", "email", "user@example.com"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));

    expect(result.current.saveStatus).toBe("error");
    expect(result.current.profile.contact.email).toBe("user@example.com");

    await act(async () => result.current.retrySave());
    expect(result.current.saveStatus).toBe("saved");
    expect(repository.save).toHaveBeenLastCalledWith(result.current.profile);
    vi.useRealTimers();
  });

  it("adds and removes repeated entries without mutating other categories", async () => {
    const repository = createRepository();
    const { result } = renderHook(() => useProfileEditor(repository, 300));
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));

    act(() => result.current.addEntry("projects", "project"));
    const entryId = result.current.profile.projects[0].id;
    act(() =>
      result.current.updateEntry(
        "projects",
        entryId,
        "projectName",
        "비식별 프로젝트",
      ),
    );
    expect(result.current.profile.projects[0].values.projectName).toBe(
      "비식별 프로젝트",
    );

    act(() => result.current.removeEntry("projects", entryId));
    expect(result.current.profile.projects).toEqual([]);
    expect(result.current.profile.personal).toEqual({});
  });

  it("serializes overlapping saves so an older write cannot finish last", async () => {
    vi.useFakeTimers();
    let finishFirstSave: (() => void) | undefined;
    const repository = createRepository();
    vi.mocked(repository.save)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProfileEditor(repository, 100));
    await act(async () => Promise.resolve());

    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "첫 값"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "최신 값"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));

    expect(repository.save).toHaveBeenCalledTimes(1);
    await act(async () => finishFirstSave?.());
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ personal: { koreanFamilyName: "최신 값" } }),
    );
    expect(result.current.saveStatus).toBe("saved");
    vi.useRealTimers();
  });

  it("replaces a pending edit with an imported profile without saving the old value", async () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useProfileEditor(repository, 100));
    await act(async () => Promise.resolve());

    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "기존 값"),
    );
    const importedProfile = {
      ...createEmptyProfile(),
      contact: { email: "example@example.test" },
    };

    await act(async () => result.current.replaceProfile(importedProfile));
    await act(async () => vi.advanceTimersByTimeAsync(100));

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenLastCalledWith(importedProfile);
    expect(result.current.profile).toEqual(importedProfile);
    vi.useRealTimers();
  });
});

it("blocks stale autosave and retry after conflict until latest profile is explicitly reloaded", async () => {
  vi.useFakeTimers();
  try {
    const repository = createRepository();
    vi.mocked(repository.save).mockRejectedValueOnce(
      new ProfileWriteConflictError(),
    );
    const latest = createEmptyProfile();
    latest.contact.email = "imported@example.invalid";
    vi.mocked(repository.load)
      .mockResolvedValueOnce(createEmptyProfile())
      .mockResolvedValueOnce(latest);
    const { result } = renderHook(() => useProfileEditor(repository, 100));
    await act(async () => Promise.resolve());
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "미저장"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(result.current.saveStatus).toBe("conflict");
    act(() =>
      result.current.updateSingle(
        "personal",
        "koreanFamilyName",
        "미저장 수정",
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () => result.current.retrySave());
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(result.current.profile.personal.koreanFamilyName).toBe(
      "미저장 수정",
    );
    await act(async () => result.current.reloadLatest());
    expect(result.current.profile.contact.email).toBe(
      "imported@example.invalid",
    );
    expect(result.current.profile.personal).toEqual({});
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "재편집"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(result.current.saveStatus).toBe("saved");
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contact: { email: "imported@example.invalid" },
        personal: { koreanFamilyName: "재편집" },
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("keeps conflict and unsaved values when reloading latest fails", async () => {
  vi.useFakeTimers();
  try {
    const repository = createRepository();
    vi.mocked(repository.save).mockRejectedValueOnce(
      new ProfileWriteConflictError(),
    );
    vi.mocked(repository.load)
      .mockResolvedValueOnce(createEmptyProfile())
      .mockRejectedValueOnce(new Error("synthetic read error"));
    const { result } = renderHook(() => useProfileEditor(repository, 100));
    await act(async () => Promise.resolve());
    act(() =>
      result.current.updateSingle("contact", "email", "draft@example.invalid"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () => result.current.reloadLatest());
    expect(result.current.reloadFailed).toBe(true);
    expect(result.current.saveStatus).toBe("conflict");
    expect(result.current.profile.contact.email).toBe("draft@example.invalid");
    await act(async () => result.current.retrySave());
    expect(repository.save).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("waits for an in-flight write before reloading and cancels queued stale edits", async () => {
  vi.useFakeTimers();
  try {
    const repository = createRepository();
    let finish!: () => void;
    vi.mocked(repository.save).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const latest = createEmptyProfile();
    latest.contact.email = "stored@example.invalid";
    vi.mocked(repository.load)
      .mockResolvedValueOnce(createEmptyProfile())
      .mockResolvedValueOnce(latest);
    const { result } = renderHook(() => useProfileEditor(repository, 100));
    await act(async () => Promise.resolve());
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "첫 편집"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    act(() =>
      result.current.updateSingle("personal", "koreanFamilyName", "대기 편집"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(100));
    let reloaded!: Promise<boolean>;
    act(() => {
      reloaded = result.current.reloadLatest();
    });
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(result.current.isReloading).toBe(true);
    await act(async () => {
      finish();
      await reloaded;
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(result.current.profile).toEqual(latest);
    expect(result.current.isReloading).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

describe("useProfileEditor certificate issuer", () => {
  const sqld = {
    status: "selected",
    catalogId: "certificate:kdata:sqld",
    displayName: "SQL 개발자",
    originalText: "SQLD",
    catalogVersion: "2026-10-07",
  } as const;

  async function editorWith(values: Record<string, string>) {
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values },
    ];
    const repository = createRepository();
    vi.mocked(repository.load).mockResolvedValue(profile);
    const { result } = renderHook(() => useProfileEditor(repository));
    await act(async () => Promise.resolve());
    return result;
  }

  it("fills a blank issuer from the selected catalog certificate", async () => {
    const result = await editorWith({ registrationNo: "DEMO-1" });

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
        sqld,
      ),
    );

    expect(result.current.profile.certifications[0]).toEqual({
      id: "certificate-1",
      sectionId: "certificate",
      values: {
        name: "SQL 개발자",
        registrationNo: "DEMO-1",
        issuer: "한국데이터산업진흥원",
      },
      identity: sqld,
    });
  });

  it("keeps a user-entered issuer when a catalog certificate is selected", async () => {
    const result = await editorWith({ issuer: "사용자 기관" });

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
        sqld,
      ),
    );

    expect(result.current.profile.certifications[0].values).toEqual({
      name: "SQL 개발자",
      issuer: "사용자 기관",
    });
  });

  it("treats a whitespace-only issuer as blank", async () => {
    const result = await editorWith({ issuer: "  " });

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
        sqld,
      ),
    );

    expect(result.current.profile.certifications[0].values.issuer).toBe(
      "한국데이터산업진흥원",
    );
  });

  it("does not fill an issuer for direct input or typing", async () => {
    const result = await editorWith({});

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
        { status: "manual", originalText: "SQL 개발자" },
      ),
    );
    expect(result.current.profile.certifications[0].values).not.toHaveProperty(
      "issuer",
    );

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
      ),
    );
    expect(result.current.profile.certifications[0].values).not.toHaveProperty(
      "issuer",
    );
  });

  it("keeps the filled issuer when the name edit releases the catalog link", async () => {
    const result = await editorWith({});
    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL 개발자",
        sqld,
      ),
    );

    act(() =>
      result.current.updateEntry(
        "certifications",
        "certificate-1",
        "name",
        "SQL",
      ),
    );

    expect(result.current.profile.certifications[0]).toMatchObject({
      values: { name: "SQL", issuer: "한국데이터산업진흥원" },
      identity: { status: "manual", originalText: "SQL" },
    });
  });
});
