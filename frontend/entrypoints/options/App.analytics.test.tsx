import { fireEvent, render, screen } from "@testing-library/react";
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
