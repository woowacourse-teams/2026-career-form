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
