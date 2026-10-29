import { loadPolicyForSender } from "../src/autofill/policy/background";
import { createProfileWriteHandler } from "../src/storage/profile-write-handler";
import { installPostingBackground } from "../src/job-postings/background";
import { installPushBackground } from "../src/job-postings/push-background";
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
  TOGGLE_IN_PAGE_PROFILE_PANEL_MESSAGE,
} from "../src/autofill-demo/messages";
import { openInPagePanel } from "../src/extension/open-in-page-panel";
import { openInstalledOnboarding } from "../src/extension/install-onboarding";
import { createPanelShortcutHandler } from "../src/extension/panel-shortcut";
import { openToolbarPanel } from "../src/extension/toolbar-panel";

export default defineBackground(() => {
  const postings = installPostingBackground();
  const handleAnalytics = createAnalyticsMessageHandler({
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST,
    storage: browser.storage.local,
  });
  const push = installPushBackground({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    extensionVersion: browser.runtime.getManifest().version,
    postings: postings.service,
    track: (event, properties) => {
      void handleAnalytics({
        type: "ANALYTICS_TRACK",
        event,
        properties,
      }).catch(() => undefined);
    },
  });
  const handleProfileWrite = createProfileWriteHandler(
    browser.storage.local,
    browser.runtime.id,
  );
  const handlePanelShortcut = createPanelShortcutHandler(
    browser.commands,
    browser.runtime.id,
  );
  // The panel shortcut (_execute_action) also lands here, like a toolbar click;
  // both open the in-page panel or close it when it is already open.
  browser.action.onClicked.addListener((tab) => {
    void openToolbarPanel(tab, {
      openPanel: (tabId) =>
        openInPagePanel(undefined, tabId, TOGGLE_IN_PAGE_PROFILE_PANEL_MESSAGE),
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
    extensionId: browser.runtime.id,
    extensionVersion: browser.runtime.getManifest().version,
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "AUTOFILL_GET_INSTALLED_BUILD") {
      const snapshot = (
        globalThis as typeof globalThis & {
          __careerFormBuildInfo?: () => unknown;
        }
      ).__careerFormBuildInfo;
      return Promise.resolve(
        snapshot?.() ?? {
          schema_version: "1.0",
          revision: null,
          source_state: "UNKNOWN",
        },
      );
    }
    if (message?.type === "AUTOFILL_LOAD_EXECUTION_POLICY")
      return loadPolicyForSender(message, sender);
    const profileResponse = handleProfileWrite(message, sender);
    if (profileResponse !== undefined) return profileResponse;
    const postingResponse = postings.handleMessage(message, sender);
    if (postingResponse !== undefined) return postingResponse;
    const pushResponse = push.handleMessage(message, sender);
    if (pushResponse !== undefined) return pushResponse;
    const shortcutResponse = handlePanelShortcut(message, sender);
    if (shortcutResponse !== undefined) return shortcutResponse;
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
    return handleMessage(message, sender);
  });
});
