import { browser } from "wxt/browser";

import type { TrackEvent } from "./events";

export const trackExtensionEvent: TrackEvent = (event, properties) => {
  if (!import.meta.env.VITE_POSTHOG_KEY?.trim()) return;
  void browser.runtime
    .sendMessage({ type: "ANALYTICS_TRACK", event, properties })
    .catch(() => undefined);
};
