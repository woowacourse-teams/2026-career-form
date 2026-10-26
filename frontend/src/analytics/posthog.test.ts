import { describe, expect, it, vi } from "vitest";

import { createPosthogCapture } from "./posthog";

describe("PostHog capture", () => {
  it("does not create an identifier or request without a key", async () => {
    const getDistinctId = vi.fn(async () => "anonymous");
    const fetcher = vi.fn<typeof fetch>();
    const capture = createPosthogCapture({
      key: " ",
      getDistinctId,
      fetch: fetcher,
    });

    await capture("landing_viewed", { surface: "site" });

    expect(getDistinctId).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the event without browser credentials or referrer", async () => {
    const requests: Request[] = [];
    const capture = createPosthogCapture({
      key: "test-project",
      host: "https://collector.example.test/",
      getDistinctId: async () => "anonymous",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("1");
      },
    });

    await capture("autofill_start_clicked", {
      surface: "in_page_panel",
      page_host: "apply.example.test",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://collector.example.test/i/v0/e/");
    expect(requests[0].credentials).toBe("omit");
    expect(requests[0].referrerPolicy).toBe("no-referrer");
    expect(await requests[0].json()).toEqual({
      api_key: "test-project",
      event: "autofill_start_clicked",
      distinct_id: "anonymous",
      timestamp: expect.any(String),
      properties: {
        surface: "in_page_panel",
        page_host: "apply.example.test",
        $process_person_profile: false,
      },
    });
  });

  it("does not interrupt the action when the collector is unavailable", async () => {
    const capture = createPosthogCapture({
      key: "test-project",
      getDistinctId: async () => "anonymous",
      fetch: async () => {
        throw new TypeError("network unavailable");
      },
    });

    await expect(capture("landing_viewed", { surface: "site" })).resolves.toBe(
      false,
    );
  });
});

describe("PostHog posting properties", () => {
  it("forwards posting_id without any other posting detail", async () => {
    const bodies: unknown[] = [];
    const capture = createPosthogCapture({
      key: "test-project",
      getDistinctId: async () => "anonymous",
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response("1");
      },
    });
    await capture("posting_inbox_viewed", { surface: "options" });
    await capture("posting_notification_opened", {
      surface: "notification",
      posting_id: "0123456789abcdef0123456789abcdef",
    });
    expect(bodies).toEqual([
      expect.objectContaining({
        properties: { surface: "options", $process_person_profile: false },
      }),
      expect.objectContaining({
        properties: {
          surface: "notification",
          posting_id: "0123456789abcdef0123456789abcdef",
          $process_person_profile: false,
        },
      }),
    ]);
  });
});

describe("PostHog answer and trigger properties", () => {
  it("forwards answer and trigger values", async () => {
    const bodies: { properties: Record<string, unknown> }[] = [];
    const capture = createPosthogCapture({
      key: "test-project",
      getDistinctId: async () => "anonymous",
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response("1");
      },
    });
    await capture("notification_visibility_answered", {
      surface: "options",
      answer: "not_seen",
    });
    await capture("posting_inbox_saved", {
      surface: "options",
      posting_id: "0123456789abcdef0123456789abcdef",
      trigger: "open",
    });
    expect(bodies.map((b) => b.properties)).toEqual([
      {
        surface: "options",
        answer: "not_seen",
        $process_person_profile: false,
      },
      {
        surface: "options",
        posting_id: "0123456789abcdef0123456789abcdef",
        trigger: "open",
        $process_person_profile: false,
      },
    ]);
  });
});

describe("PostHog delay_ms property", () => {
  it("forwards delay_ms including zero", async () => {
    const bodies: { properties: Record<string, unknown> }[] = [];
    const capture = createPosthogCapture({
      key: "test-project",
      getDistinctId: async () => "anonymous",
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response("1");
      },
    });
    await capture("posting_notification_shown", {
      surface: "notification",
      posting_id: "0123456789abcdef0123456789abcdef",
      delay_ms: 0,
    });
    expect(bodies[0].properties).toEqual({
      surface: "notification",
      posting_id: "0123456789abcdef0123456789abcdef",
      delay_ms: 0,
      $process_person_profile: false,
    });
  });
});
