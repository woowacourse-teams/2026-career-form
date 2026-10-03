import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAnalyticsMessageHandler } from "../src/analytics/background-analytics";
import { parseAnalyticsMessage } from "../src/analytics/events";
import { createAddressRelay } from "../src/autofill/address/relay";

import { createAnalysisMessageHandler } from "../src/autofill/api/background-handler";
import {
  isOpenInPageProfilePanelMessage,
  isOpenOptionsPageMessage,
  isOpenSidePanelMessage,
} from "../src/autofill-demo/messages";
import { openInPagePanel } from "../src/extension/open-in-page-panel";
import { openInstalledOnboarding } from "../src/extension/install-onboarding";
import { openToolbarPanel } from "../src/extension/toolbar-panel";

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void openToolbarPanel(tab, {
      openPanel: (tabId) => openInPagePanel(undefined, tabId),
      openProfile: () => browser.runtime.openOptionsPage(),
    }).catch(() => undefined);
  });
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void openInstalledOnboarding(reason, () =>
      browser.tabs.create({
        url: `chrome-extension://${browser.runtime.id}/onboarding.html`,
      }),
    ).catch(() => undefined);
  });
  browser.runtime.onConnect.addListener(createAddressRelay(browser.runtime.id));
  const handleMessage = createAnalysisMessageHandler({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
  });
  const handleAnalytics = createAnalyticsMessageHandler({
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST,
    storage: browser.storage.local,
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (parseAnalyticsMessage(message)) {
      return handleAnalytics(message);
    }
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
