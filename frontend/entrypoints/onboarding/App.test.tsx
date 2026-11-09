import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  createPushClient,
  createRepository,
  createStepMemory,
} from "./flow/test-support";

beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

function renderApp(track = vi.fn()) {
  render(
    <App
      repository={createRepository()}
      track={track}
      pushClient={createPushClient()}
      stepStore={createStepMemory().store}
    />,
  );
  return track;
}

it("설치 뒤 열린 온보딩은 선택 화면 없이 이름 입력으로 시작하고 최초 진입을 기록한다", async () => {
  const track = renderApp();
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "이름부터 알려 주세요",
    }),
  ).toBeVisible();
  expect(screen.queryByText("설치 완료")).toBeNull();
  expect(screen.queryByRole("button", { name: /자동 기입 준비/ })).toBeNull();
  expect(track).toHaveBeenCalledWith("onboarding_first_viewed", {
    surface: "extension_onboarding",
  });
});

it("page 인자로 연 랜딩은 온보딩 흐름 대신 소개 페이지를 보인다", () => {
  window.history.replaceState(null, "", "/onboarding.html?page=%2F");
  const track = renderApp();
  expect(screen.queryByRole("navigation", { name: "진행 상황" })).toBeNull();
  expect(track).toHaveBeenCalledWith("landing_viewed", {
    surface: "extension_onboarding",
  });
  expect(track).not.toHaveBeenCalledWith(
    "onboarding_first_viewed",
    expect.anything(),
  );
});
