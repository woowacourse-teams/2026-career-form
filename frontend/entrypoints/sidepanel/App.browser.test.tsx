import { within } from "@testing-library/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEmptyProfile } from "../../src/profile/model";
import { App } from "./App";

it("keeps the copy status inside the viewport when the profile list overflows", async () => {
  const host = document.createElement("div");
  host.style.width = "390px";
  const previousMargin = document.body.style.margin;
  document.body.style.margin = "0";
  document.body.append(host);
  const root = createRoot(host);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성 ".repeat(400);

  try {
    await act(async () => {
      root.render(
        <App
          repository={{
            load: async () => profile,
            save: async () => undefined,
            loadLayout: async () => "a",
            saveLayout: async () => undefined,
          }}
          copyText={async () => undefined}
          track={() => undefined}
          showPostings={false}
        />,
      );
    });
    const ui = within(host);
    await act(async () => ui.getByRole("tab", { name: "내 정보" }).click());
    const list = ui.getByRole("main", { name: "지원 정보 목록" });
    const status = ui.getByRole("status", { name: "복사 상태" });
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(document.documentElement.scrollHeight).toBe(
      document.documentElement.clientHeight,
    );

    await userEvent.click(ui.getByRole("button", { name: "국문 이름 복사" }));
    expect(status.textContent).not.toBe("");
    expect(document.documentElement.scrollHeight).toBe(
      document.documentElement.clientHeight,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.body.style.margin = previousMargin;
  }
});

it("keeps the tabs in place, fits short tabs and scrolls only below the tabs", async () => {
  const host = document.createElement("div");
  host.style.cssText =
    "position: fixed; top: 80px; right: 20px; width: 380px; overflow: hidden";
  document.body.append(host);
  const root = createRoot(host);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성 ".repeat(800);

  try {
    await act(async () => {
      root.render(
        <App
          inPage
          fitContent
          repository={{
            load: async () => profile,
            save: async () => undefined,
            loadLayout: async () => "a",
            saveLayout: async () => undefined,
          }}
          savedPostings={{
            list: async () => [],
            subscribe: () => () => undefined,
          }}
          track={() => undefined}
        />,
      );
    });
    const ui = within(host);
    const profileTab = ui.getByRole("tab", { name: "내 정보" });
    const top = profileTab.getBoundingClientRect().top;
    const start = ui.getByRole("button", { name: "자동 기입" });
    expect(start.getBoundingClientRect().height).toBe(44);
    expect(host.getBoundingClientRect().height).toBeLessThan(260);

    await act(async () => ui.getByRole("tab", { name: "마감 공고" }).click());
    expect(profileTab.getBoundingClientRect().top).toBe(top);
    expect(host.getBoundingClientRect().height).toBeLessThan(260);

    await act(async () => profileTab.click());
    expect(profileTab.getBoundingClientRect().top).toBe(top);
    const list = ui.getByRole("main", { name: "지원 정보 목록" });
    const maximum = window.innerHeight - 100;
    expect(host.getBoundingClientRect().height).toBeLessThanOrEqual(maximum);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    list.scrollTop = 200;
    expect(list.scrollTop).toBe(200);
    expect(profileTab.getBoundingClientRect().top).toBe(top);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
