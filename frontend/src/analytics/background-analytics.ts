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
  const getDistinctId = () => {
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
  };
  const capture = createPosthogCapture({ ...options, getDistinctId });
  let firstEventQueue = Promise.resolve();
  return async (message: unknown) => {
    const parsed = parseAnalyticsMessage(message);
    if (!parsed || !options.key?.trim()) return;
    const timestamp = new Date(Date.now()).toISOString();
    if (
      parsed.event !== "onboarding_first_viewed" &&
      parsed.event !== "profile_first_saved"
    ) {
      await capture(parsed.event, parsed.properties, timestamp);
      return;
    }
    // One background handler owns the queue; persisted records survive restarts.
    firstEventQueue = firstEventQueue
      .then(async () => {
        const distinctId = await getDistinctId();
        const key = `analyticsFirst:${parsed.event}:${distinctId}`;
        const stored = (await storage.get(key))[key];
        const previous =
          typeof stored === "object" && stored !== null ? stored : undefined;
        if (previous && "delivered" in previous && previous.delivered === true)
          return;
        const firstTimestamp =
          previous &&
          "timestamp" in previous &&
          typeof previous.timestamp === "string"
            ? previous.timestamp
            : timestamp;
        // Persist occurrence before delivery so a later retry keeps its cohort time.
        await storage.set({
          [key]: { timestamp: firstTimestamp, delivered: false },
        });
        if (await capture(parsed.event, parsed.properties, firstTimestamp)) {
          await storage.set({
            [key]: { timestamp: firstTimestamp, delivered: true },
          });
        }
      })
      .catch(() => undefined);
    await firstEventQueue;
  };
}
