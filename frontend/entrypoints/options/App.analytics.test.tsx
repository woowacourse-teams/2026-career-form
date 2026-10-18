import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

it("tracks picker and export clicks without contents", async () => {
  const profile = createEmptyProfile();
  profile.contact.email = "private@example.com";
  const repository = {
    load: async () => profile,
    save: async () => {},
    loadLayout: async () => "a" as const,
    saveLayout: async () => {},
  };
  const track = vi.fn();
  const downloadProfile = vi.fn();
  render(
    <App
      repository={repository}
      track={track}
      downloadProfile={downloadProfile}
    />,
  );
  await screen.findByRole("heading", { name: "프로필 관리" });
  const picker = vi.spyOn(screen.getByLabelText("프로필 JSON 파일"), "click");
  expect(track).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
  fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
  expect(track.mock.calls).toEqual([
    ["profile_import_clicked", { surface: "options" }],
    ["profile_export_clicked", { surface: "options" }],
  ]);
  expect(picker).toHaveBeenCalledOnce();
  expect(downloadProfile).toHaveBeenCalledOnce();
});

it.each([
  { value: "예시", failed: false, expected: 1 },
  { value: "   ", failed: false, expected: 0 },
  { value: "예시", failed: true, expected: 0 },
])(
  "tracks only nonempty successful editor saves: %j",
  async ({ value, failed, expected }) => {
    const saved: ReturnType<typeof createEmptyProfile>[] = [];
    const events: unknown[] = [];
    const repository = {
      load: async () => createEmptyProfile(),
      save: async (profile: ReturnType<typeof createEmptyProfile>) => {
        if (failed) throw new Error("storage unavailable");
        saved.push(structuredClone(profile));
      },
      loadLayout: async () => "a" as const,
      saveLayout: async () => {},
    };
    render(
      <App
        repository={repository}
        track={(event, properties) => events.push({ event, properties })}
      />,
    );
    await screen.findByRole("heading", { name: "프로필 관리" });
    expect(events).toEqual([]);
    fireEvent.change(screen.getByLabelText("국문 성"), { target: { value } });
    expect(events).toEqual([]);
    await screen.findByText(failed ? "저장 실패" : "저장됨");
    await waitFor(() => expect(events).toHaveLength(expected));
    if (expected) {
      expect(saved[0].personal.koreanFamilyName).toBe("예시");
      expect(events).toEqual([
        { event: "profile_first_saved", properties: { surface: "options" } },
      ]);
    }
    if (failed) {
      expect(saved).toEqual([]);
      failed = false;
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      await screen.findByText("저장됨");
      await waitFor(() =>
        expect(events).toEqual([
          { event: "profile_first_saved", properties: { surface: "options" } },
        ]),
      );
    }
  },
);

it("does not report a successful profile save as failed when tracking throws", async () => {
  let stored = createEmptyProfile();
  const repository = {
    load: async () => stored,
    save: async (profile: typeof stored) => {
      stored = structuredClone(profile);
    },
    loadLayout: async () => "a" as const,
    saveLayout: async () => {},
  };
  render(
    <App
      repository={repository}
      track={() => {
        throw new Error("analytics unavailable");
      }}
    />,
  );
  await screen.findByRole("heading", { name: "프로필 관리" });
  fireEvent.change(screen.getByLabelText("국문 성"), {
    target: { value: "예시" },
  });
  await screen.findByText("저장됨");
  expect(stored.personal.koreanFamilyName).toBe("예시");
});
