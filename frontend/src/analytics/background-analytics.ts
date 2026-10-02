import { parseAnalyticsMessage } from "./events";
import { createPosthogCapture } from "./posthog";

interface AnalyticsOptions {
  readonly key?: string;
  readonly host?: string;
  readonly fetch?: typeof fetch;
  readonly storage: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
}

export function createAnalyticsMessageHandler({
  storage,
  ...options
}: AnalyticsOptions) {
  // Share initialization across concurrent messages; storage survives SW restarts.
  let pendingId: Promise<string> | undefined;
  const capture = createPosthogCapture({
    ...options,
    getDistinctId: () => {
      pendingId ??= (async () => {
        const stored = await storage.get("analyticsDistinctId");
        if (typeof stored.analyticsDistinctId === "string") {
          return stored.analyticsDistinctId;
        }
        const id = crypto.randomUUID();
        await storage.set({ analyticsDistinctId: id });
        return id;
      })().finally(() => {
        pendingId = undefined;
      });
      return pendingId;
    },
  });
  return async (message: unknown) => {
    const parsed = parseAnalyticsMessage(message);
    if (parsed) await capture(parsed.event, parsed.properties);
  };
}
