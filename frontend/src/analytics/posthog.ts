import type { AnalyticsEvent, AnalyticsProperties } from "./events";

interface CaptureOptions {
  readonly key?: string;
  readonly host?: string;
  readonly getDistinctId: () => Promise<string>;
  readonly fetch?: typeof fetch;
}

export function createPosthogCapture({
  key,
  host = "https://us.i.posthog.com",
  getDistinctId,
  fetch: fetcher = globalThis.fetch,
}: CaptureOptions) {
  return async (event: AnalyticsEvent, properties: AnalyticsProperties) => {
    if (!key?.trim()) return;
    try {
      const distinctId = await getDistinctId();
      await fetcher(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        priority: "low",
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: distinctId,
          properties: {
            surface: properties.surface,
            ...(properties.surface === "in_page_panel" && properties.page_host
              ? { page_host: properties.page_host }
              : {}),
            $process_person_profile: false,
          },
        }),
      });
    } catch {
      // Analytics must not interrupt profile actions or log private context.
      return;
    }
  };
}
