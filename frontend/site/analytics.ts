import { createPosthogCapture } from "../src/analytics/posthog";

interface SiteTrackerOptions {
  key?: string;
  host?: string;
  fetch?: typeof fetch;
}

export function createSiteTracker(options: SiteTrackerOptions = {}) {
  return createPosthogCapture({
    ...options,
    getDistinctId: async () => {
      const stored = localStorage.getItem("analyticsDistinctId");
      if (stored) return stored;
      const id = crypto.randomUUID();
      localStorage.setItem("analyticsDistinctId", id);
      return id;
    },
  });
}
