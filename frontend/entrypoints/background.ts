import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAnalysisMessageHandler } from "../src/autofill/api/background-handler";

export default defineBackground(() => {
  const handleMessage = createAnalysisMessageHandler({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
  });
  browser.runtime.onMessage.addListener((message) => handleMessage(message));
});
