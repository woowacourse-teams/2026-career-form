import { describe, expect, it, vi } from "vitest";

import { createAnalyticsMessageHandler } from "./background-analytics";

function collector(key = "test-project") {
  const payloads: unknown[] = [];
  const values: Record<string, unknown> = {};
  let writes = 0;
  const handle = createAnalyticsMessageHandler({
    key,
    storage: {
      get: async () => ({ ...values }),
      set: async (items) => {
        writes += 1;
        Object.assign(values, items);
      },
    },
    fetch: async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response("1");
    },
  });
  return { handle, payloads, values, writes: () => writes };
}

describe("analytics background boundary", () => {
  it("keeps only allowlisted properties and a hostname", async () => {
    const { handle, payloads } = collector();

    await handle({
      type: "ANALYTICS_TRACK",
      event: "profile_copy_clicked",
      properties: {
        surface: "in_page_panel",
        page_host: "apply.example.test",
        value: "synthetic-private-value",
        url: "https://apply.example.test/form?token=synthetic",
      },
    });

    expect(payloads).toEqual([
      {
        api_key: "test-project",
        event: "profile_copy_clicked",
        distinct_id: expect.any(String),
        timestamp: expect.any(String),
        properties: {
          surface: "in_page_panel",
          page_host: "apply.example.test",
          $process_person_profile: false,
        },
      },
    ]);
  });

  it.each([
    null,
    { type: "OTHER" },
    {
      type: "ANALYTICS_TRACK",
      event: "private-input",
      properties: { surface: "site" },
    },
    {
      type: "ANALYTICS_TRACK",
      event: "landing_viewed",
      properties: { surface: "private-surface" },
    },
  ])(
    "ignores invalid messages without storing identifiers: %j",
    async (message) => {
      const { handle, payloads, values } = collector();

      await handle(message);

      expect(payloads).toEqual([]);
      expect(values).toEqual({});
    },
  );

  it.each([
    "https://apply.example.test/form",
    "apply.example.test/path",
    "someone@example.test",
    "apply.example.test?token=private",
    "apply.example.test:8080",
  ])("drops non-hostname page_host %s", async (page_host) => {
    const { handle, payloads } = collector();

    await handle({
      type: "ANALYTICS_TRACK",
      event: "profile_copy_clicked",
      properties: { surface: "in_page_panel", page_host },
    });

    expect(payloads).toEqual([
      expect.objectContaining({
        properties: {
          surface: "in_page_panel",
          $process_person_profile: false,
        },
      }),
    ]);
  });

  it("does not include a page host for extension pages", async () => {
    const { handle, payloads } = collector();

    await handle({
      type: "ANALYTICS_TRACK",
      event: "profile_management_clicked",
      properties: { surface: "side_panel", page_host: "apply.example.test" },
    });

    expect(payloads).toEqual([
      expect.objectContaining({
        properties: { surface: "side_panel", $process_person_profile: false },
      }),
    ]);
  });

  it("reuses one persisted identifier for concurrent first events", async () => {
    const { handle, payloads, values, writes } = collector();
    const message = {
      type: "ANALYTICS_TRACK",
      event: "profile_management_clicked",
      properties: { surface: "side_panel" },
    };

    await Promise.all([handle(message), handle(message)]);

    expect(writes()).toBe(1);
    expect(payloads).toHaveLength(2);
    for (const payload of payloads) {
      expect(payload).toEqual(
        expect.objectContaining({ distinct_id: values.analyticsDistinctId }),
      );
    }
  });

  it("never stores or sends anything without a project key", async () => {
    const { handle, payloads, values } = collector("");

    await handle({
      type: "ANALYTICS_TRACK",
      event: "landing_viewed",
      properties: { surface: "site" },
    });

    expect(payloads).toEqual([]);
    expect(values).toEqual({});
  });
});

const firstView = {
  type: "ANALYTICS_TRACK",
  event: "onboarding_first_viewed",
  properties: {
    surface: "extension_onboarding",
    email: "private@example.test",
  },
};
function firstCollector() {
  const values: Record<string, unknown> = {};
  const payloads: Record<string, unknown>[] = [];
  let reject = false;
  const options = {
    key: "test-project",
    storage: {
      get: async () => ({ ...values }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      },
    },
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response("", { status: reject ? 503 : 200 });
    },
  };
  return {
    options,
    values,
    payloads,
    reject: (value: boolean) => {
      reject = value;
    },
  };
}
it.each(["onboarding_first_viewed", "profile_first_saved"])(
  "deduplicates %s across concurrent messages and restarts",
  async (event) => {
    const { options, values, payloads } = firstCollector();
    const handle = createAnalyticsMessageHandler(options);
    await Promise.all([
      handle({ ...firstView, event }),
      handle({ ...firstView, event }),
    ]);
    await createAnalyticsMessageHandler(options)({ ...firstView, event });
    expect(payloads).toEqual([
      expect.objectContaining({
        event,
        distinct_id: values.analyticsDistinctId,
        timestamp: expect.any(String),
        properties: {
          surface: "extension_onboarding",
          $process_person_profile: false,
        },
      }),
    ]);
  },
);
it("retries rejected capture with its original cohort timestamp", async () => {
  const { options, payloads, reject } = firstCollector();
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.parse("2026-01-01T00:00:00Z"));
  try {
    reject(true);
    await createAnalyticsMessageHandler(options)(firstView);
    clock.mockReturnValue(Date.parse("2026-01-02T00:00:00Z"));
    reject(false);
    await createAnalyticsMessageHandler(options)(firstView);
    await createAnalyticsMessageHandler(options)(firstView);
    expect(payloads).toHaveLength(2);
    expect(payloads.map((p) => p.timestamp)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  } finally {
    clock.mockRestore();
  }
});
it("isolates storage failures and never reads storage without a key", async () => {
  let reads = 0;
  const storage = {
    get: async () => {
      reads++;
      throw new Error("unavailable");
    },
    set: async () => {
      throw new Error("unavailable");
    },
  };
  await expect(
    createAnalyticsMessageHandler({ key: " ", storage })(firstView),
  ).resolves.toBeUndefined();
  expect(reads).toBe(0);
  await expect(
    createAnalyticsMessageHandler({ key: "test", storage })(firstView),
  ).resolves.toBeUndefined();
  expect(reads).toBe(1);
});

it("keeps repeatable funnel events and ties first-event deduplication to the installation ID", async () => {
  const { options, values, payloads } = firstCollector();
  values.analyticsDistinctId = "installation-one";
  const handle = createAnalyticsMessageHandler(options);
  await handle(firstView);
  for (const event of [
    "onboarding_autofill_selected",
    "onboarding_postings_selected",
    "quick_profile_viewed",
    "quick_profile_skipped",
    "autofill_open_succeeded",
    "autofill_open_failed",
  ]) {
    await handle({ ...firstView, event });
    await handle({ ...firstView, event });
  }
  values.analyticsDistinctId = "installation-two";
  await handle(firstView);
  expect(payloads).toHaveLength(14);
  expect(
    payloads
      .filter((p) => p.event === "onboarding_first_viewed")
      .map((p) => p.distinct_id),
  ).toEqual(["installation-one", "installation-two"]);
});
it("recovers from an unavailable local store on a later first event", async () => {
  const { options, payloads } = firstCollector();
  let available = false;
  const set = options.storage.set;
  options.storage.set = async (items) => {
    if (!available) throw new Error("storage unavailable");
    await set(items);
  };
  const handle = createAnalyticsMessageHandler(options);
  await expect(handle(firstView)).resolves.toBeUndefined();
  expect(payloads).toHaveLength(0);
  available = true;
  await handle(firstView);
  expect(payloads).toHaveLength(1);
});
