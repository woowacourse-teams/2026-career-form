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
import { usePolicyFixture } from "../test/fixtures/execution-policy";

usePolicyFixture("greeting");

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
  await screen.findByText("프로필에 가져올 정보");
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
  await waitFor(() =>
    expect(profile.contact.email).toBe("fixture@example.invalid"),
  );
  const notice = await screen.findByRole("status", {
    name: "가져오기 결과",
  });
  expect(notice).toHaveTextContent(/프로필에 \d+개를 저장했어요/);
  expect(notice).toHaveTextContent(
    "다른 지원서에서 자동 기입을 누르면 방금 저장한 정보로 채울 수 있어요",
  );
  expect(notice.textContent).not.toContain("·");
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
  await screen.findByText("프로필에 가져올 정보");
  fireEvent.click(screen.getByRole("button", { name: /프로필에 저장하기/ }));
  await screen.findByRole("status", { name: "가져오기 결과" });
  const { act } = await import("@testing-library/react");
  await act(async () => {
    releaseInitial(old);
    await initial;
  });
  expect(screen.getByRole("button", { name: "이메일주소 복사" })).toBeVisible();
});

it("loads the Greeting policy before reading when none is installed yet", async () => {
  document.body.innerHTML = greetingImportFixture();
  const { installExecutionPolicy } =
    await import("../autofill/workflow/execution-policy");
  const { fixturePolicy } = await import("../test/fixtures/execution-policy");
  installExecutionPolicy(document);
  const api = createApiClient();
  api.loadExecutionPolicy = vi.fn(async () => fixturePolicy("greeting"));
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={api}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "지원서에서 가져오기" }));
  expect(await screen.findByText("프로필에 가져올 정보")).toBeVisible();
  expect(api.loadExecutionPolicy).toHaveBeenCalledOnce();
});

it("offers another read when the policy cannot be loaded", async () => {
  document.body.innerHTML = greetingImportFixture();
  const { installExecutionPolicy } =
    await import("../autofill/workflow/execution-policy");
  installExecutionPolicy(document);
  const api = createApiClient();
  api.loadExecutionPolicy = vi.fn(async () => {
    throw new Error("private network detail");
  });
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={api}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "지원서에서 가져오기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못");
  expect(screen.queryByText(/private network detail/)).toBeNull();
  expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
});

it("records one import offer when the panel opens on a recognized Greeting form", async () => {
  document.body.innerHTML = greetingImportFixture();
  const track = vi.fn();
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={createApiClient()}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      track={track}
    />,
  );
  await waitFor(() =>
    expect(track).toHaveBeenCalledWith("greeting_import_offered", {
      surface: "in_page_panel",
      page_host: "fixture.career.greetinghr.com",
    }),
  );
  expect(
    track.mock.calls.filter(([event]) => event === "greeting_import_offered"),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "지원서에서 가져오기" }));
  await screen.findByText("프로필에 가져올 정보");
  expect(track).toHaveBeenCalledWith("greeting_import_viewed", {
    surface: "in_page_panel",
    page_host: "fixture.career.greetinghr.com",
  });
});

it("records no import offer when the page is not a recognized Greeting form", async () => {
  document.body.innerHTML = "<form><input name='unrelated' /></form>";
  const track = vi.fn();
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={createApiClient()}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      track={track}
    />,
  );
  expect(
    await screen.findByRole("button", { name: "지원서에서 가져오기" }),
  ).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(track).not.toHaveBeenCalledWith(
    "greeting_import_offered",
    expect.anything(),
  );
});

it("keeps the panel usable and records no offer when the policy cannot be loaded", async () => {
  document.body.innerHTML = greetingImportFixture();
  const { installExecutionPolicy } =
    await import("../autofill/workflow/execution-policy");
  installExecutionPolicy(document);
  const api = createApiClient();
  api.loadExecutionPolicy = vi.fn(async () => {
    throw new Error("private network detail");
  });
  const track = vi.fn();
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => {},
        loadLayout: async () => "a",
        saveLayout: async () => {},
      }}
      apiClient={api}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      track={track}
    />,
  );
  expect(
    await screen.findByRole("button", { name: "지원서에서 가져오기" }),
  ).toBeVisible();
  await waitFor(() => expect(api.loadExecutionPolicy).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(track).not.toHaveBeenCalledWith(
    "greeting_import_offered",
    expect.anything(),
  );
});
