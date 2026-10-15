import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InPageProfilePanel } from "./InPageProfilePanel";
import { createProfilePanelController } from "./profile-panel-controller";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";
import { greetingImportFixture } from "../research/greeting-import-probe.test-fixtures";
import { createApiClient } from "../autofill-demo/AutofillOverlay.test-fixtures";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
it("imports current Greeting values through the panel, refreshes profile, and keeps the page unchanged", async () => {
  document.body.innerHTML = greetingImportFixture();
  const form = document.querySelector("form")!;
  const original = form.outerHTML;
  let profile = createEmptyProfile();
  const repository: ProfileRepository = {
    load: async () => structuredClone(profile),
    save: vi.fn(async (next) => {
      profile = structuredClone(next);
    }),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const api = createApiClient();
  const controller = createProfilePanelController();
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={repository}
      apiClient={api}
      controller={controller}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "지원서에서 가져오기" }),
  );
  await screen.findByLabelText("국문 성");
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
  await waitFor(() =>
    expect(profile.contact.email).toBe("fixture@example.invalid"),
  );
  expect(
    await screen.findByText("선택한 정보를 프로필에 저장했습니다."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "이메일주소 복사" })).toBeVisible();
  expect(form.outerHTML).toBe(original);
  expect(api.analyzePreparation).not.toHaveBeenCalled();
  expect(api.analyzeFields).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /자동 기입/ }));
  expect(controller.getSnapshot()).toBe("autofill");
});

it("does not replace an imported profile with the panel's late initial load", async () => {
  document.body.innerHTML = greetingImportFixture();
  const old = createEmptyProfile();
  let releaseInitial!: (value: typeof old) => void;
  let profile = createEmptyProfile();
  const initial = new Promise<typeof old>((resolve) => {
    releaseInitial = resolve;
  });
  let loads = 0;
  const repository: ProfileRepository = {
    load: () =>
      ++loads === 1 ? initial : Promise.resolve(structuredClone(profile)),
    save: async (next) => {
      profile = structuredClone(next);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={repository}
      apiClient={createApiClient()}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "지원서에서 가져오기" }));
  await screen.findByLabelText("국문 성");
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
  await screen.findByText("선택한 정보를 프로필에 저장했습니다.");
  const { act } = await import("@testing-library/react");
  await act(async () => {
    releaseInitial(old);
    await initial;
  });
  expect(screen.getByRole("button", { name: "이메일주소 복사" })).toBeVisible();
});
