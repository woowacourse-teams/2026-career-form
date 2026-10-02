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

    await expect(
      capture("landing_viewed", { surface: "site" }),
    ).resolves.toBeUndefined();
  });
});
