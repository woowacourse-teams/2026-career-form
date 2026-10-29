import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

const SHORTCUT_TEXT = /이 패널을 열 수 있어요|단축키가 없어요/;

function repository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.contact.email = "copy@example.com";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("panel shortcut hint", () => {
  it("현재 할당된 패널 단축키를 헤더에 보여 준다", async () => {
    render(
      <App
        repository={repository()}
        readPanelShortcut={async () => "Alt+Shift+C"}
      />,
    );

    const hint = await screen.findByText(/로 이 패널을 열 수 있어요/);
    expect(hint.querySelector("kbd")).toHaveTextContent("Alt+Shift+C");
    expect(hint.closest("header")).not.toBeNull();
  });

  it("단축키가 없으면 지정 위치를 안내한다", async () => {
    render(
      <App repository={repository()} readPanelShortcut={async () => ""} />,
    );

    expect(
      await screen.findByText(
        "패널을 여는 단축키가 없어요. chrome://extensions/shortcuts에서 지정할 수 있어요",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/이 패널을 열 수 있어요/)).toBeNull();
  });

  it("단축키를 읽지 못하면 처리되지 않은 거부 없이 안내를 숨긴다", async () => {
    const readPanelShortcut = vi.fn(async () => {
      throw new Error("background unavailable");
    });
    render(
      <App repository={repository()} readPanelShortcut={readPanelShortcut} />,
    );
    await screen.findByText("copy@example.com");

    expect(readPanelShortcut).toHaveBeenCalled();
    expect(screen.queryByText(SHORTCUT_TEXT)).toBeNull();
  });

  it("단축키 값을 알 수 없거나 읽기 함수가 없으면 안내를 숨긴다", async () => {
    const { unmount } = render(
      <App
        repository={repository()}
        readPanelShortcut={async () => undefined}
      />,
    );
    await screen.findByText("copy@example.com");
    expect(screen.queryByText(SHORTCUT_TEXT)).toBeNull();
    unmount();

    render(<App repository={repository()} />);
    await screen.findByText("copy@example.com");
    expect(screen.queryByText(SHORTCUT_TEXT)).toBeNull();
  });

  it("자동 기입 화면에서는 안내를 숨긴다", async () => {
    const readPanelShortcut = vi.fn(async () => "Alt+Shift+C");
    render(
      <App
        repository={repository()}
        readPanelShortcut={readPanelShortcut}
        autofillView={<p>자동 기입 진행</p>}
      />,
    );
    await screen.findByText("자동 기입 진행");
    await Promise.resolve();

    expect(screen.queryByText(SHORTCUT_TEXT)).toBeNull();
  });
});
