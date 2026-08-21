import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../model";
import type { ProfileRepository } from "../profile-repository";
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
});
