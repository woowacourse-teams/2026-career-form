import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
function createRepository(): ProfileRepository {
  let profile = createEmptyProfile();
  return {
    load: async () => structuredClone(profile),
    save: async (next) => {
      profile = structuredClone(next);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
}
beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("설치 후 자동 기입을 선택하면 설치 안내 없이 기본 정보만 등록한다", async () => {
  const repository = createRepository();
  render(<App repository={repository} />);
  fireEvent.click(screen.getByRole("button", { name: /자동 기입 준비하기/ }));
  expect(await screen.findByLabelText("국문 성")).toBeVisible();
  expect(screen.getByLabelText("국문 이름")).toBeVisible();
  expect(screen.queryByLabelText("이메일")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByLabelText("이메일");
  expect(screen.queryByRole("link", { name: /Chrome에 추가/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "learner@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
  );
  await screen.findByRole("heading", {
    name: "지원서에서 자동 기입을 시작하세요",
  });
  expect((await repository.load()).contact.email).toBe("learner@example.test");
});

it("프로필 없이 공고 등록으로 시작하고 시작 방법을 다시 선택할 수 있다", () => {
  render(<App repository={createRepository()} />);
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

it("공고 안내는 패널 열기, 정보 입력, 완료 단계를 제공하고 이전 안내와 선택 화면으로 돌아간다", async () => {
  render(<App repository={createRepository()} />);
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
  expect(await screen.findByLabelText("국문 성")).toBeVisible();
});

it("저장한 프로필이 있으면 다시 질문하지 않고 보충할 정보를 고른다", async () => {
  const repository = createRepository();
  const profile = createEmptyProfile();
  profile.contact.email = "saved@example.test";
  await repository.save(profile);
  render(<App repository={repository} />);
  fireEvent.click(screen.getByRole("button", { name: /자동 기입 준비하기/ }));
  await screen.findByRole("heading", {
    name: "저장한 정보부터 이어서 준비해요",
  });
  expect(screen.queryByLabelText("국문 성")).toBeNull();
  expect(screen.getByText("saved@example.test")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "이메일 수정" }));
  expect(screen.getByLabelText("이메일")).toHaveValue("saved@example.test");
});
