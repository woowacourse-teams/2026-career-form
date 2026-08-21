import { browser } from "wxt/browser";

import { OPEN_AUTOFILL_OVERLAY_MESSAGE } from "../autofill-demo/messages";

interface RuntimeApi {
  openOptionsPage(): Promise<void>;
}

interface SidePanelDependencies {
  windows: { getCurrent(): Promise<{ id?: number }> };
  sidePanel: { open(options: { windowId: number }): Promise<void> };
}

interface ActiveTabMessenger {
  query(options: {
    active: true;
    currentWindow: true;
  }): Promise<Array<{ id?: number }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export async function openOptionsPage(
  runtime: RuntimeApi = browser.runtime,
): Promise<void> {
  await runtime.openOptionsPage();
}

export async function openSidePanel(
  dependencies: SidePanelDependencies = {
    windows: browser.windows,
    sidePanel: browser.sidePanel,
  },
): Promise<void> {
  const currentWindow = await dependencies.windows.getCurrent();
  if (currentWindow.id === undefined) {
    throw new Error("현재 창을 확인할 수 없습니다.");
  }
  await dependencies.sidePanel.open({ windowId: currentWindow.id });
}

export async function openAutofillOverlay(
  tabs: ActiveTabMessenger = {
    query: (options) => browser.tabs.query(options),
    sendMessage: (tabId, message) => browser.tabs.sendMessage(tabId, message),
  },
): Promise<void> {
  const [activeTab] = await tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id === undefined) {
    throw new Error("현재 페이지를 확인할 수 없습니다.");
  }
  await tabs.sendMessage(activeTab.id, OPEN_AUTOFILL_OVERLAY_MESSAGE);
}
