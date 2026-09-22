import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("retains the existing three-step onboarding and finishes without navigating to website routes", () => {
  let closed = false;
  const { container } = render(
    <App
      openOptions={() => {}}
      close={() => {
        closed = true;
      }}
    />,
  );
  expect(
    container.querySelector('aside [aria-current="step"]'),
  ).toHaveTextContent("확장 프로그램 설치");
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 방법/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("프로필");
  expect(screen.getByTitle("프로필 관리 버튼 위치")).toHaveAttribute(
    "src",
    "/onboarding-guide.html?kind=profile",
  );
  fireEvent.click(screen.getByRole("button", { name: /첫 실행 방법/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("지원서");
  fireEvent.click(screen.getByRole("button", { name: /이전 안내/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("프로필");
  fireEvent.click(screen.getByRole("button", { name: /첫 실행 방법/ }));
  fireEvent.click(screen.getByRole("button", { name: /안내 마치기/ }));
  expect(closed).toBe(true);
  expect(
    container.querySelector(
      'a[href="/"], a[href="/privacy/"], a[href="/terms/"]',
    ),
  ).toBeNull();
});

it("opens real profile management without collecting profile values", async () => {
  let opened = false;
  let closed = false;
  render(
    <App
      openOptions={async () => {
        opened = true;
      }}
      close={() => {
        closed = true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 방법/ }));
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(opened).toBe(true);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));
  expect(closed).toBe(true);
});
it("allows retry when profile management cannot open", async () => {
  let attempts = 0;
  render(
    <App
      openOptions={async () => {
        attempts++;
        if (attempts === 1) throw new Error("unavailable");
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 방법/ }));
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리 열기" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(attempts).toBe(2);
});
