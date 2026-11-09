import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DEVELOPER_MODE_KEY,
  INCLUDE_NEEDS_REVIEW_KEY,
  createDeveloperModeStore,
  createIncludeNeedsReviewStore,
} from "../../src/autofill/debug/developer-mode";
import { DeveloperSettings } from "./DeveloperSettings";

function fakeStore(developerBuild: boolean) {
  const data: Record<string, unknown> = {};
  const ports = {
    developerBuild,
    storage: {
      get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
      set: async (values: Record<string, unknown>) => {
        Object.assign(data, values);
      },
    },
    onChanged: {
      addListener: () => undefined,
      removeListener: () => undefined,
    },
  };
  return {
    store: createDeveloperModeStore(ports),
    includeStore: createIncludeNeedsReviewStore(ports),
    data,
  };
}

const INCLUDE_LABEL = "확인 필요 포함";

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

  it("hides the include toggle in a non-developer build", () => {
    const { store, includeStore } = fakeStore(false);
    render(
      <DeveloperSettings
        developerBuild={false}
        store={store}
        includeNeedsReviewStore={includeStore}
      />,
    );
    expect(screen.queryByText(INCLUDE_LABEL)).toBeNull();
  });

  it("shows the include toggle only while developer mode is on", async () => {
    const { store, includeStore, data } = fakeStore(true);
    render(
      <DeveloperSettings
        developerBuild
        store={store}
        includeNeedsReviewStore={includeStore}
      />,
    );
    const toggle = screen.getByRole("switch", { name: INCLUDE_LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    await waitFor(() => expect(data[INCLUDE_NEEDS_REVIEW_KEY]).toBe(true));
    expect(screen.getByRole("switch", { name: INCLUDE_LABEL })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("switch", { name: "개발자 모드" }));
    await waitFor(() =>
      expect(screen.queryByRole("switch", { name: INCLUDE_LABEL })).toBeNull(),
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
