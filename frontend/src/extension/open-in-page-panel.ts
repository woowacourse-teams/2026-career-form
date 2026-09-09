import { browser } from "wxt/browser";

import { OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE } from "../autofill-demo/messages";

interface ActiveTabApi {
  query(options: {
    active: true;
    currentWindow: true;
  }): Promise<Array<{ id?: number }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

interface ScriptingApi {
  executeScript(options: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
}

interface OpenInPagePanelDependencies {
  tabs: ActiveTabApi;
  scripting: ScriptingApi;
}

export async function openInPagePanel(
  dependencies: OpenInPagePanelDependencies = {
    tabs: browser.tabs,
    scripting: browser.scripting,
  },
): Promise<void> {
  const [tab] = await dependencies.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id === undefined) {
    throw new Error("현재 지원서 페이지를 확인할 수 없습니다.");
  }

  try {
    await dependencies.tabs.sendMessage(
      tab.id,
      OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE,
    );
  } catch {
    await dependencies.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-scripts/autofill.js"],
    });
    await dependencies.tabs.sendMessage(
      tab.id,
      OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE,
    );
  }
}
