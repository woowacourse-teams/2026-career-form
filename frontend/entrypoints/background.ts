import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAddressRelay } from "../src/autofill/address/relay";

import { createAnalysisMessageHandler } from "../src/autofill/api/background-handler";
import {
  isOpenInPageProfilePanelMessage,
  isOpenOptionsPageMessage,
  isOpenSidePanelMessage,
} from "../src/autofill-demo/messages";
import { openInPagePanel } from "../src/extension/open-in-page-panel";

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
      return openInPagePanel();
    }
    return handleMessage(message);
  });
});
