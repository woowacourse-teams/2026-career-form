import { describe, expect, it } from "vitest";

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
