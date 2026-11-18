import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { readResumeText } from "../../src/profile/resume-import/resume-file";
import type { ResumeDraftResult } from "../../src/profile/resume-import/resume-import-client";
import { App } from "./App";

const RESUME_TEXT = "합성 이력서\nsynthetic.panel@example.test";

function setup({
  readImportCandidates,
}: { readImportCandidates?: () => Promise<never[]> } = {}) {
  let stored: Profile = createEmptyProfile();
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: vi.fn(async (next: Profile) => {
      stored = structuredClone(next);
    }),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const requestResumeDraft = vi.fn(async (): Promise<ResumeDraftResult> => ({
    ok: true,
    profile: {
      ...createEmptyProfile(),
      contact: { email: "synthetic.panel@example.test" },
      education: [],
    } as never,
  }));
  const track = vi.fn();
  render(
    <StrictMode>
      <App
        repository={repository}
        track={track}
        readImportCandidates={readImportCandidates}
        readResumeText={(file) => readResumeText(file, async () => "")}
        requestResumeDraft={requestResumeDraft}
      />
    </StrictMode>,
  );
  return { requestResumeDraft, track, stored: () => stored };
}

const openChoice = () => {
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  fireEvent.click(screen.getByRole("button", { name: "프로필 가져오기" }));
};
const fileInput = () =>
  document.querySelector<HTMLInputElement>("input[type=file]")!;
const pick = (file: File) =>
  fireEvent.change(fileInput(), { target: { files: [file] } });

afterEach(() => vi.restoreAllMocks());

it("shows 프로필 가져오기 on every page and offers only the resume file", () => {
  setup();
  openChoice();
  expect(screen.queryByRole("button", { name: /^지원서 화면/ })).toBeNull();
  const resume = screen.getByRole("button", { name: /^이력서 파일/ });
  expect(resume).toBeEnabled();
  expect(resume).toHaveTextContent("PDF · MD · TXT");
  expect(
    screen.getByRole("heading", { name: "프로필 가져오기" }),
  ).toBeVisible();
});

it("opens the OS file dialog directly from 이력서 파일", () => {
  const click = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(() => {});
  setup();
  openChoice();
  fireEvent.click(screen.getByRole("button", { name: /^이력서 파일/ }));
  expect(click).toHaveBeenCalledOnce();
  expect(click.mock.instances[0]).toBe(fileInput());
  expect(fileInput()).toHaveAttribute(
    "accept",
    expect.stringContaining(".pdf"),
  );
});

it("imports a picked resume after the notice and returns to the profile tab", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  const state = setup();
  openChoice();
  fireEvent.click(screen.getByRole("button", { name: /^이력서 파일/ }));
  pick(new File([RESUME_TEXT], "합성.md"));
  await screen.findByText("문서 글자를 서버로 보내요");
  expect(state.requestResumeDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속" }));
  await screen.findByText("프로필에 가져올 정보");
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
  const notice = await screen.findByRole("status", { name: "가져오기 결과" });
  expect(notice).toHaveTextContent("프로필에 1개를 저장했어요");
  expect(state.stored().contact.email).toBe("synthetic.panel@example.test");
  expect(screen.getByRole("tab", { name: "내 정보" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(state.requestResumeDraft).toHaveBeenCalledOnce();
  expect(
    state.track.mock.calls.filter(
      ([event]) => event === "resume_import_viewed",
    ),
  ).toHaveLength(1);
  expect(
    state.track.mock.calls.filter(([event]) => event === "resume_import_saved"),
  ).toHaveLength(1);
});

it("keeps the application-page import behind the 지원서 화면 choice", async () => {
  const read = vi.fn(async () => []);
  const state = setup({ readImportCandidates: read });
  openChoice();
  expect(read).not.toHaveBeenCalled();
  expect(state.track).not.toHaveBeenCalledWith(
    "greeting_import_viewed",
    expect.anything(),
  );
  const page = screen.getByRole("button", { name: /^지원서 화면/ });
  expect(page).toBeEnabled();
  fireEvent.click(page);
  const region = await screen.findByRole("region", {
    name: "지원서에서 프로필 가져오기",
  });
  await waitFor(() => expect(read).toHaveBeenCalled());
  expect(state.track).toHaveBeenCalledWith("greeting_import_viewed", {
    surface: "side_panel",
  });
  fireEvent.click(within(region).getByRole("button", { name: "닫기" }));
  expect(
    screen.queryByRole("region", { name: "지원서에서 프로필 가져오기" }),
  ).toBeNull();
});
