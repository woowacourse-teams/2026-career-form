import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createAnalyticsMessageHandler } from "../../src/analytics/background-analytics";
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

it.each([true, false])(
  "records the actual autofill opening result (success=%s)",
  async (success) => {
    const payloads: { event: string; properties: Record<string, unknown> }[] =
      [];
    const values: Record<string, unknown> = {};
    const handle = createAnalyticsMessageHandler({
      key: "test-project",
      storage: {
        get: async () => ({ ...values }),
        set: async (items) => {
          Object.assign(values, items);
        },
      },
      fetch: async (_input, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        return new Response("1");
      },
    });
    render(
      <App
        repository={{
          load: async () => createEmptyProfile(),
          save: async () => {},
          loadLayout: async () => "a",
          saveLayout: async () => {},
        }}
        track={(event, properties) => {
          void handle({ type: "ANALYTICS_TRACK", event, properties });
        }}
        openAutofill={async () => {
          if (!success) throw new Error("unavailable");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));
    await waitFor(() =>
      expect(payloads.map((payload) => payload.event)).toEqual([
        "autofill_start_clicked",
        success ? "autofill_open_succeeded" : "autofill_open_failed",
      ]),
    );
    expect(payloads.map((payload) => payload.properties)).toEqual([
      { surface: "side_panel", $process_person_profile: false },
      { surface: "side_panel", $process_person_profile: false },
    ]);
    if (!success) expect(screen.getByRole("alert")).toBeInTheDocument();
  },
);
