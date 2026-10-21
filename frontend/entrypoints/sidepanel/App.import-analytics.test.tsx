import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { expect, it, vi } from "vitest";
import { createAnalyticsMessageHandler } from "../../src/analytics/background-analytics";
import { createEmptyProfile, type Profile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

function setup({ inPage = false, failure = "", alreadySaved = false } = {}) {
  let profile = createEmptyProfile();
  let email = "synthetic@example.test";
  let finish: (() => void) | undefined;
  const values: Record<string, unknown> = {
    analyticsDistinctId: "synthetic-id",
  };
  if (alreadySaved)
    values["analyticsFirst:profile_first_saved:synthetic-id"] = {
      delivered: true,
    };
  const payloads: {
    event: string;
    distinct_id: string;
    properties: Record<string, unknown>;
  }[] = [];
  const requests: Promise<void>[] = [];
  const handle = createAnalyticsMessageHandler({
    key: failure === "no-key" ? "" : "test-project",
    storage: {
      get: async () => ({ ...values }),
      set: async (items) => {
        Object.assign(values, items);
      },
    },
    fetch: async (_input, init) => {
      if (failure === "network") throw new Error("offline");
      payloads.push(JSON.parse(String(init?.body)));
      return new Response("1");
    },
  });
  const persist = async (_baseline: Profile, saved: Profile) => {
    if (failure === "save") throw new Error("storage failure");
    if (failure === "conflict") return false;
    if (failure === "pending")
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    profile = structuredClone(saved);
    return true;
  };
  const repository: ProfileRepository = {
    load: async () => structuredClone(profile),
    save: async () => {
      throw new Error("CAS must be preserved");
    },
    saveIfUnchanged: vi.fn(persist),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const read = vi.fn(async () => {
    if (failure === "read") throw new Error("reader failure");
    return [
      {
        source: "basicInformation.email",
        profileFieldKey: "contact.contact.email",
        status: "available" as const,
        reason: "direct",
        value: email,
      },
    ];
  });
  render(
    <StrictMode>
      <App
        repository={repository}
        inPage={inPage}
        readImportCandidates={read}
        track={(event, properties) => {
          if (failure === "throw") throw new Error("tracker unavailable");
          requests.push(handle({ type: "ANALYTICS_TRACK", event, properties }));
        }}
      />
    </StrictMode>,
  );
  return {
    payloads,
    repository,
    read,
    values,
    flush: () => Promise.all(requests),
    profile: () => profile,
    finish: () => finish?.(),
    next: () => {
      email = "next@example.test";
    },
  };
}
const enter = () =>
  fireEvent.click(screen.getByRole("button", { name: "지원서에서 가져오기" }));
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
const ready = () => screen.findByText("프로필에 가져올 정보");
const close = () =>
  fireEvent.click(
    within(
      screen.getByRole("region", { name: "지원서에서 프로필 가져오기" }),
    ).getByRole("button", { name: "닫기" }),
  );

it.each([false, true])(
  "tracks each opening and successful save with only permitted properties (inPage=%s)",
  async (inPage) => {
    const state = setup({ inPage });
    enter();
    await ready();
    close();
    enter();
    await ready();
    save();
    await screen.findByRole("status", { name: "가져오기 결과" });
    await state.flush();
    expect(state.payloads.map((p) => p.event)).toEqual([
      "greeting_import_viewed",
      "greeting_import_viewed",
      "greeting_import_saved",
      "profile_first_saved",
    ]);
    for (const payload of state.payloads) {
      expect(payload.distinct_id).toBe("synthetic-id");
      expect(payload.properties).toEqual(
        inPage
          ? {
              surface: "in_page_panel",
              page_host: window.location.hostname,
              $process_person_profile: false,
            }
          : { surface: "side_panel", $process_person_profile: false },
      );
    }
    expect(state.profile().contact.email).toBe("synthetic@example.test");
    state.next();
    enter();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /연락처와 주소/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
    save();
    await screen.findByRole("status", { name: "가져오기 결과" });
    await state.flush();
    expect(
      state.payloads.filter((p) => p.event === "profile_first_saved"),
    ).toHaveLength(1);
    expect(
      state.payloads.filter((p) => p.event === "greeting_import_saved"),
    ).toHaveLength(2);
  },
);

it.each(["read", "save", "conflict"])(
  "does not record completion after %s failure",
  async (failure) => {
    const state = setup({ failure });
    enter();
    if (failure !== "read") {
      await ready();
      save();
    }
    await screen.findByRole("alert");
    await state.flush();
    expect(state.payloads.map((p) => p.event)).toEqual([
      "greeting_import_viewed",
    ]);
    expect(state.profile().contact).toEqual({});
  },
);

it("records no completion on cancel", async () => {
  const state = setup();
  enter();
  await ready();
  close();
  await state.flush();
  expect(state.payloads.map((p) => p.event)).toEqual([
    "greeting_import_viewed",
  ]);
});

it("records only one completion after pending duplicate clicks", async () => {
  const state = setup({ failure: "pending" });
  enter();
  await ready();
  save();
  save();
  await waitFor(() =>
    expect(state.repository.saveIfUnchanged).toHaveBeenCalledOnce(),
  );
  await state.flush();
  expect(state.payloads.map((p) => p.event)).toEqual([
    "greeting_import_viewed",
  ]);
  state.finish();
  await screen.findByRole("status", { name: "가져오기 결과" });
  await state.flush();
  expect(state.payloads.map((p) => p.event)).toEqual([
    "greeting_import_viewed",
    "greeting_import_saved",
    "profile_first_saved",
  ]);
});

it("does not resend an already delivered first save", async () => {
  const state = setup({ alreadySaved: true });
  enter();
  await ready();
  save();
  await screen.findByRole("status", { name: "가져오기 결과" });
  await state.flush();
  expect(state.payloads.map((p) => p.event)).toEqual([
    "greeting_import_viewed",
    "greeting_import_saved",
  ]);
});

it.each(["no-key", "network", "throw"])(
  "preserves reading, review and saving when analytics is unavailable: %s",
  async (failure) => {
    const state = setup({ failure });
    enter();
    await ready();
    save();
    await screen.findByRole("status", { name: "가져오기 결과" });
    await state.flush();
    expect(state.profile().contact.email).toBe("synthetic@example.test");
    expect(state.payloads).toEqual([]);
    if (failure === "no-key")
      expect(state.values).toEqual({ analyticsDistinctId: "synthetic-id" });
  },
);
