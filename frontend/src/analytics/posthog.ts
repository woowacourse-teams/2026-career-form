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
  return async (
    event: AnalyticsEvent,
    properties: AnalyticsProperties,
    timestamp = new Date(Date.now()).toISOString(),
  ): Promise<boolean> => {
    if (!key?.trim()) return false;
    try {
      const distinctId = await getDistinctId();
      const response = await fetcher(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
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
          timestamp,
          properties: {
            surface: properties.surface,
            ...(properties.surface === "in_page_panel" && properties.page_host
              ? { page_host: properties.page_host }
              : {}),
            ...(properties.posting_id
              ? { posting_id: properties.posting_id }
              : {}),
            ...(properties.answer ? { answer: properties.answer } : {}),
            ...(properties.trigger ? { trigger: properties.trigger } : {}),
            ...(properties.delay_ms === undefined
              ? {}
              : { delay_ms: properties.delay_ms }),
            $process_person_profile: false,
          },
        }),
      });
      return response.ok;
    } catch {
      // Analytics must not interrupt profile actions or log private context.
      return false;
    }
  };
}
