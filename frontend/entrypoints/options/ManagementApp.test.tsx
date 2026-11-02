import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi, afterEach } from "vitest";
vi.mock("./App", () => ({ App: () => <h1>프로필 관리 화면</h1> }));
vi.mock("../../src/job-postings/JobPostings", () => ({
  JobPostings: (props: object) => (
    <h1 data-props={JSON.stringify(props)}>지원 공고 화면</h1>
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
    screen.getByRole("heading", { name: "지원 공고 화면" }),
  ).toHaveAttribute("data-props", "{}");
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));
  await screen.findByRole("heading", { name: "프로필 관리 화면" });
  fireEvent.click(screen.getByRole("button", { name: "지원 공고" }));
  await screen.findByRole("heading", { name: "지원 공고 화면" });
});
