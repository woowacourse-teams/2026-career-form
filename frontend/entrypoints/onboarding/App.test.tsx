import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("자동 기입 안내는 배포 사이트와 동일한 설치부터 4단계를 제공한다", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /자동 기입 준비하기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Chrome에 커리어폼을 추가하세요.",
  );
  expect(screen.getByText("01 / 04")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 알아보기/ }));
  expect(screen.getByText("02 / 04")).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("프로필");
  expect(screen.queryByRole("link", { name: /프로필 등록하기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /지원서에서 사용하기/ }));
  expect(screen.getByText("03 / 04")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /결과 확인 알아보기/ }));
  expect(screen.getByText("04 / 04")).toBeVisible();
});

it("프로필 없이 공고 등록으로 시작하고 시작 방법을 다시 선택할 수 있다", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "무엇부터 시작할까요?",
  );
  expect(screen.getByText(/프로필 등록 없이 바로/)).toBeVisible();
  expect(screen.getByText(/Chrome이 완전히 종료된 동안/)).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: /공고 저장부터 시작하기/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: /시작 방법 다시 선택/ }));
  expect(
    screen.getByRole("button", { name: /공고 저장부터 시작하기/ }),
  ).toBeVisible();
});

it("공고 안내는 패널 열기, 정보 입력, 완료 단계를 제공하고 이전 안내와 선택 화면으로 돌아간다", () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /공고 저장부터 시작하기/ }),
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "커리어폼 사이드패널을 여세요.",
  );
  expect(
    screen.queryByRole("link", { name: /지원 공고 관리 열기/ }),
  ).toBeNull();
  expect(screen.queryByText(/실제 화면 캡처/)).toBeNull();
  expect(
    screen.queryByRole("link", { name: /실제 화면 크게 보기/ }),
  ).toBeNull();
  expect(screen.getByText("방법 1 · 페이지의 네모 아이콘")).toBeVisible();
  expect(screen.getByText("방법 2 · Chrome 퍼즐 메뉴")).toBeVisible();
  expect(screen.getByText("01 / 03")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /공고 정보 입력하기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "공고 정보와 마감을 입력하세요.",
  );
  expect(screen.getByText(/Chrome이 완전히 종료된 동안/)).toBeVisible();
  expect(
    screen.getByRole("region", { name: "마감 알림 동작 미리보기" }),
  ).toBeVisible();
  expect(screen.getByText("알림을 누르면 저장한 공고가 열려요.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다시 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(screen.getByRole("button", { name: "계속 재생" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /지원 완료 알아보기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "지원했다면 완료로 표시하세요.",
  );
  expect(screen.getByRole("link", { name: /공고 추가하기/ })).toHaveAttribute(
    "href",
    "/options.html#postings/new",
  );
  fireEvent.click(screen.getByRole("button", { name: /이전 안내/ }));
  expect(screen.getByText("02 / 03")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /시작 방법 다시 선택/ }));
  fireEvent.click(screen.getByRole("button", { name: /자동 기입 준비하기/ }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Chrome에 커리어폼",
  );
  expect(screen.getByText("01 / 04")).toBeVisible();
});
