import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAddressRelay } from "../src/autofill/address/relay";

import { createAnalysisMessageHandler } from "../src/autofill/api/background-handler";
import {
  OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE,
  isOpenInPageProfilePanelMessage,
  isOpenOptionsPageMessage,
  isOpenSidePanelMessage,
} from "../src/autofill-demo/messages";

export default defineBackground(() => {
  browser.runtime.onConnect.addListener(createAddressRelay(browser.runtime.id));
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
    if (isOpenInPageProfilePanelMessage(message)) {
      return browser.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (tab?.id === undefined) {
            throw new Error("현재 지원서 페이지를 확인할 수 없습니다.");
          }
          return browser.tabs.sendMessage(tab.id, OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE);
        });
    }
    return handleMessage(message);
  });
});
