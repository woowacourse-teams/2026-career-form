import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../../src/profile/model";
import type { ProfileRepository } from "../../../src/profile/profile-repository";
import { readResumeText } from "../../../src/profile/resume-import/resume-file";
import type { ResumeDraftResult } from "../../../src/profile/resume-import/resume-import-client";
import { OnboardingFlow } from "./OnboardingFlow";
import { createPushClient, createStepMemory } from "./test-support";

function setup() {
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
      personal: { koreanFamilyName: "합", koreanGivenName: "성" },
      contact: { email: "synthetic.onboarding@example.test" },
      education: [],
    } as never,
  }));
  const track = vi.fn();
  const steps = createStepMemory("name");
  render(
    <OnboardingFlow
      repository={repository}
      pushClient={createPushClient()}
      track={track}
      stepStore={steps.store}
      onOpenProfile={() => {}}
      onOpenPostings={() => {}}
      readResumeText={(file) => readResumeText(file, async () => "")}
      requestResumeDraft={requestResumeDraft}
    />,
  );
  return { requestResumeDraft, track, steps, stored: () => stored };
}

const fileInput = () =>
  document.querySelector<HTMLInputElement>("input[type=file]")!;

afterEach(() => vi.restoreAllMocks());

it("이름 단계 카드의 버튼이 OS 파일 창을 바로 연다", async () => {
  const click = vi
    .spyOn(HTMLInputElement.prototype, "click")
    .mockImplementation(() => {});
  setup();
  await screen.findByRole("heading", {
    level: 1,
    name: "이름부터 알려 주세요",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "이력서 파일로 가져오기" }),
  );
  expect(click).toHaveBeenCalledOnce();
  expect(click.mock.instances[0]).toBe(fileInput());
});

it("고른 이력서를 같은 카드 자리에서 가져오고 저장 뒤 다음 단계로 간다", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  const state = setup();
  await screen.findByRole("heading", {
    level: 1,
    name: "이름부터 알려 주세요",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "이력서 파일로 가져오기" }),
  );
  fireEvent.change(fileInput(), {
    target: { files: [new File(["합성 이력서 본문"], "합성.txt")] },
  });
  await screen.findByText("문서 글자를 서버로 보내요");
  expect(state.requestResumeDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "계속" }));
  await screen.findByText("프로필에 가져올 정보");
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "이메일" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "이메일" })).toHaveValue(
    "synthetic.onboarding@example.test",
  );
  expect(state.stored().personal).toMatchObject({
    koreanFamilyName: "합",
    koreanGivenName: "성",
  });
  expect(state.steps.written).toContain("email");
  expect(state.track).toHaveBeenCalledWith("resume_import_saved", {
    surface: "extension_onboarding",
  });
});

it("전송 안내에서 취소하면 요청 없이 이름 단계로 돌아온다", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  const state = setup();
  await screen.findByRole("heading", {
    level: 1,
    name: "이름부터 알려 주세요",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "이력서 파일로 가져오기" }),
  );
  fireEvent.change(fileInput(), {
    target: { files: [new File(["합성"], "합성.md")] },
  });
  await screen.findByText("문서 글자를 서버로 보내요");
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { level: 1, name: "이름부터 알려 주세요" }),
    ).toBeVisible(),
  );
  expect(state.requestResumeDraft).not.toHaveBeenCalled();
});
