import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAddressRelay } from "../src/autofill/address/relay";

import { createAnalysisMessageHandler } from "../src/autofill/api/background-handler";
import {
  OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE,
  isOpenOptionsPageMessage,
  isOpenSidePanelMessage,
} from "../src/autofill-demo/messages";

export default defineBackground(() => {
  browser.runtime.onConnect.addListener(createAddressRelay(browser.runtime.id));
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    void browser.tabs.sendMessage(tab.id, OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE)
      .catch(() => undefined);
  });
  const handleMessage = createAnalysisMessageHandler({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (isOpenOptionsPageMessage(message)) {
      return browser.runtime.openOptionsPage();
    }
    if (isOpenSidePanelMessage(message)) {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return undefined;
      return browser.sidePanel.open({ tabId });
    }
    return handleMessage(message);
  });
});
