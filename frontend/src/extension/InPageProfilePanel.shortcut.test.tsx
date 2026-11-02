import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createApiClient } from "../autofill-demo/AutofillOverlay.test-fixtures";
import { createEmptyProfile } from "../profile/model";
import { InPageProfilePanel } from "./InPageProfilePanel";
import { createProfilePanelController } from "./profile-panel-controller";

afterEach(() => cleanup());

it("페이지 안 패널은 주입한 단축키 읽기로 안내한다", async () => {
  const readPanelShortcut = vi.fn(async () => "Alt+Shift+C");
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => undefined,
        loadLayout: async () => "a",
        saveLayout: async () => undefined,
      }}
      apiClient={createApiClient()}
      controller={createProfilePanelController()}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      readPanelShortcut={readPanelShortcut}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  const hint = await screen.findByText(/로 이 패널을 열고 닫을 수 있어요/);
  expect(hint.querySelector("kbd")).toHaveTextContent("Alt+Shift+C");
  expect(readPanelShortcut).toHaveBeenCalled();
});

it("페이지 안 패널은 탭에서만 내용 높이에 맞추고 작업 화면은 전체 높이를 유지한다", async () => {
  const controller = createProfilePanelController();
  render(
    <InPageProfilePanel
      pageDocument={document}
      repository={{
        load: async () => createEmptyProfile(),
        save: async () => undefined,
        loadLayout: async () => "a",
        saveLayout: async () => undefined,
      }}
      apiClient={createApiClient()}
      controller={controller}
      closePanel={() => {}}
      openOptions={() => {}}
      logoUrl="/logo.png"
      readPanelShortcut={async () => undefined}
    />,
  );
  await screen.findByRole("tablist");
  expect(document.querySelector("[data-panel-fit]")).not.toBeNull();

  await act(async () => controller.startAutofill());

  expect(screen.queryByRole("tab", { name: "내 정보" })).toBeNull();
  expect(document.querySelector("[data-panel-fit]")).toBeNull();
});
