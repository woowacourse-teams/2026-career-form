import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("starts installed users with opening guidance and keeps all three steps reachable", () => {
  const { container } = render(<App />);
  expect(screen.queryByRole("link", { name: /Chrome에 추가/ })).toBeNull();
  expect(screen.getByRole("link", { name: /소개 페이지로/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "나중에 할게요" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 알아보기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("프로필");
  expect(screen.getByRole("link", { name: /프로필 등록하기/ })).toHaveAttribute(
    "href",
    "/options.html",
  );
  expect(screen.queryByRole("button", { name: "프로필 관리 열기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /사용 방법 알아보기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("지원서");
  expect(screen.getByRole("link", { name: /안내 마치기/ })).toHaveAttribute(
    "href",
    "/onboarding.html?page=%2F",
  );
  expect(container.querySelector("input")).toBeNull();
});
