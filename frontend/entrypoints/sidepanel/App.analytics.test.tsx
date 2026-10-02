import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

it.each([false, true])(
  "tracks panel clicks without values (inPage=%s)",
  async (inPage) => {
    const profile = createEmptyProfile();
    profile.contact.email = "private@example.com";
    const repository = {
      load: async () => profile,
      save: async () => {},
      loadLayout: async () => "a" as const,
      saveLayout: async () => {},
    };
    const track = vi.fn();
    const copyText = vi.fn(async () => {});
    const openOptions = vi.fn(async () => {});
    const openAutofill = vi.fn(async () => {});
    render(
      <App
        repository={repository}
        inPage={inPage}
        track={track}
        copyText={copyText}
        openOptions={openOptions}
        openAutofill={openAutofill}
      />,
    );
    await screen.findByText(profile.contact.email);
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));
    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));
    const properties = inPage
      ? { surface: "in_page_panel", page_host: window.location.hostname }
      : { surface: "side_panel" };
    expect(track.mock.calls).toEqual([
      ["profile_copy_clicked", properties],
      ["profile_management_clicked", properties],
      ["autofill_start_clicked", properties],
    ]);
    expect(copyText).toHaveBeenCalledWith(profile.contact.email);
    expect(openOptions).toHaveBeenCalledOnce();
    expect(openAutofill).toHaveBeenCalledOnce();
  },
);
