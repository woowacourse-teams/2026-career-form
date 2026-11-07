import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi, afterEach } from "vitest";
vi.mock("./App", () => ({ App: () => <h1>프로필 관리 화면</h1> }));
vi.mock("../../src/job-postings/JobPostings", () => ({
  JobPostings: (props: { openSettings: boolean; onSettingsOpened(): void }) => (
    <h1 data-props={JSON.stringify(props)}>
      지원 공고 화면
      <button type="button" onClick={props.onSettingsOpened}>
        설정 열림
      </button>
    </h1>
  ),
}));
import { ManagementApp } from "./ManagementApp";
afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});
it("프로필과 지원 공고를 오가고 옛 등록 주소는 지원 공고 화면으로 연다", async () => {
  window.history.replaceState(null, "", "#postings/new");
  render(<ManagementApp />);
  expect(
    screen.getByRole("heading", { name: /지원 공고 화면/ }),
  ).toHaveAttribute("data-props", '{"openSettings":false}');
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));
  await screen.findByRole("heading", { name: "프로필 관리 화면" });
  fireEvent.click(screen.getByRole("button", { name: "지원 공고" }));
  await screen.findByRole("heading", { name: /지원 공고 화면/ });
});
it("설정 해시는 알림 설정을 열라고 넘기고, 열리면 해시를 지원 공고로 되돌린다", async () => {
  window.history.replaceState(null, "", "#postings/settings");
  render(<ManagementApp />);
  expect(
    screen.getByRole("heading", { name: /지원 공고 화면/ }),
  ).toHaveAttribute("data-props", '{"openSettings":true}');
  fireEvent.click(screen.getByRole("button", { name: "설정 열림" }));
  expect(window.location.hash).toBe("#postings");
  expect(
    await screen.findByRole("heading", { name: /지원 공고 화면/ }),
  ).toHaveAttribute("data-props", '{"openSettings":false}');
});
it.each([
  ["roles", true],
  ["name", true],
  ["usage", false],
  [undefined, false],
] as const)(
  "끝내지 않은 온보딩(%s)이 있을 때만 시작 안내로 돌아가는 링크를 보인다",
  async (step, shown) => {
    render(
      <ManagementApp
        stepStore={{ read: async () => step, write: async () => {} }}
      />,
    );
    await screen.findByRole("heading", { name: "프로필 관리 화면" });
    if (shown)
      expect(
        await screen.findByRole("link", { name: "시작 안내 이어하기" }),
      ).toHaveAttribute("href", "/onboarding.html");
    else {
      await Promise.resolve();
      expect(
        screen.queryByRole("link", { name: "시작 안내 이어하기" }),
      ).toBeNull();
    }
  },
);
