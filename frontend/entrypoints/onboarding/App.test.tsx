import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("starts installed users with profile registration and finishes after usage guidance", () => {
  const { container } = render(<App />);
  expect(screen.queryByRole("link", { name: /Chrome에 추가/ })).toBeNull();
  expect(screen.getByRole("link", { name: /소개 페이지로/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "개인정보처리방침" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "나중에 할게요" })).toBeNull();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("프로필");
  expect(screen.getByRole("link", { name: /프로필 등록하기/ })).toHaveAttribute(
    "href",
    "/options.html",
  );
  expect(screen.queryByRole("button", { name: "프로필 관리 열기" })).toBeNull();
  expect(screen.getByText("01 / 03")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /지원서에서 사용하기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("지원서");
  expect(screen.getByText("02 / 03")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /결과 확인 알아보기/ }));
  expect(screen.getByText("03 / 03")).toBeVisible();
  expect(
    screen.getByTitle("값을 복사해 지원서에 붙여넣는 시연"),
  ).toHaveAttribute("src", "/onboarding-guide.html?view=guide-results");
  expect(
    screen.getByRole("link", { name: /내 프로필 확인하기/ }),
  ).toHaveAttribute("href", "/options.html");
  expect(container.querySelector("input")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /이전 안내/ }));
  fireEvent.click(screen.getByRole("button", { name: /이전 안내/ }));
  expect(screen.getByRole("link", { name: /프로필 등록하기/ })).toBeVisible();
});
