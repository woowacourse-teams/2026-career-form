import { browser } from "wxt/browser";

interface RuntimeApi {
  openOptionsPage(): Promise<void>;
}

interface SidePanelDependencies {
  windows: { getCurrent(): Promise<{ id?: number }> };
  sidePanel: { open(options: { windowId: number }): Promise<void> };
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
