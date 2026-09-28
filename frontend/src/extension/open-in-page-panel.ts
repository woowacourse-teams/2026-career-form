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
    target: { tabId: number; allFrames?: boolean };
    files: string[];
    world?: "ISOLATED" | "MAIN";
  }): Promise<unknown>;
}

/** Manifest MAIN-world bridges; must match entrypoints/*-main.content.ts output. */
export const MAIN_WORLD_BRIDGE_SCRIPT =
  "content-scripts/verified-js-result-main.js";

interface OpenInPagePanelDependencies {
  tabs: ActiveTabApi;
  scripting: ScriptingApi;
}

export async function openInPagePanel(
  dependencies: OpenInPagePanelDependencies = {
    tabs: browser.tabs,
    scripting: browser.scripting,
  },
  tabId?: number,
): Promise<void> {
  const [tab] =
    tabId !== undefined
      ? [{ id: tabId }]
      : await dependencies.tabs.query({
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
    // A tab opened before the extension was (re)loaded has neither manifest
    // content script. Re-inject the MAIN-world result-click bridge into every
    // existing frame too; otherwise javascript: search results fail without ack.
    // The bridge claims each document once, so frames that already have it are
    // unaffected. A frame that refuses injection only leaves that frame unsupported.
    // If any frame is off-limits the all-frames call may reject as a whole, so
    // the top frame is retried on its own.
    await dependencies.scripting
      .executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: [MAIN_WORLD_BRIDGE_SCRIPT],
        world: "MAIN",
      })
      .catch(() =>
        dependencies.scripting.executeScript({
          target: { tabId: tab.id! },
          files: [MAIN_WORLD_BRIDGE_SCRIPT],
          world: "MAIN",
        }),
      )
      .catch(() => undefined);
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
