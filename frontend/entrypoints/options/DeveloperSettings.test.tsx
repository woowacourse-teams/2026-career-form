import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DEVELOPER_MODE_KEY,
  createDeveloperModeStore,
} from "../../src/autofill/debug/developer-mode";
import { DeveloperSettings } from "./DeveloperSettings";

function fakeStore(developerBuild: boolean) {
  const data: Record<string, unknown> = {};
  const store = createDeveloperModeStore({
    developerBuild,
    storage: {
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      set: async (values) => {
        Object.assign(data, values);
      },
    },
    onChanged: {
      addListener: () => undefined,
      removeListener: () => undefined,
    },
  });
  return { store, data };
}

describe("DeveloperSettings", () => {
  it("renders nothing in a non-developer build", () => {
    const { store } = fakeStore(false);
    render(<DeveloperSettings developerBuild={false} store={store} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("개발자 설정")).toBeNull();
    expect(screen.queryByText("개발 빌드만")).toBeNull();
  });

  it("shows a compact ON switch row with a dev-build marker by default in a developer build", () => {
    const { store } = fakeStore(true);
    render(<DeveloperSettings developerBuild store={store} />);
    expect(screen.queryByText("개발자 설정")).toBeNull();
    expect(screen.getByText("개발 빌드만")).toBeVisible();
    const toggle = screen.getByRole("switch", { name: "개발자 모드" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAccessibleDescription(
      "자동 기입 중 상세 진행 화면과 진단 로그 표시",
    );
  });

  it("persists the toggled value to storage", async () => {
    const { store, data } = fakeStore(true);
    render(<DeveloperSettings developerBuild store={store} />);
    fireEvent.click(screen.getByRole("switch", { name: "개발자 모드" }));
    await waitFor(() => expect(data[DEVELOPER_MODE_KEY]).toBe(false));
    expect(screen.getByRole("switch", { name: "개발자 모드" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("switch", { name: "개발자 모드" }));
    await waitFor(() => expect(data[DEVELOPER_MODE_KEY]).toBe(true));
  });
});
