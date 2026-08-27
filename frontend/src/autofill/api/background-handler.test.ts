import { describe, expect, it, vi } from "vitest";

import { createAnalysisMessageHandler } from "./background-handler";

const message = {
  type: "AUTOFILL_ANALYZE_FIELDS" as const,
  payload: {
    schemaVersion: 2 as const,
    snapshotId: "snapshot-b",
    site: { host: "example.test", pathPattern: "/apply" },
    sections: [
      {
        sectionId: "contact",
        fields: [],
      },
    ],
  },
};

describe("analysis background handler", () => {
  it("ignores unrelated extension messages without making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handleMessage = createAnalysisMessageHandler({
      baseUrl: "https://api.example.test",
      fetcher,
    });

    await expect(
      handleMessage({ type: "OPEN_OVERLAY" }),
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when the API origin has not been configured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handleMessage = createAnalysisMessageHandler({
      baseUrl: "  ",
      fetcher,
    });

    await expect(handleMessage(message)).resolves.toEqual({
      ok: false,
      code: "NOT_CONFIGURED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts only to the fixed fields endpoint and returns parsed JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ snapshotId: "snapshot-b" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const handleMessage = createAnalysisMessageHandler({
      baseUrl: "https://api.example.test/",
      fetcher,
    });

    await expect(handleMessage(message)).resolves.toEqual({
      ok: true,
      data: { snapshotId: "snapshot-b" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/fields/analyze",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(message.payload),
      }),
    );
  });

  it("waits up to 60 seconds before timing out by default", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetcher = vi.fn<typeof fetch>(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("The request was aborted", "AbortError"));
            });
          }),
      );
      const handleMessage = createAnalysisMessageHandler({
        baseUrl: "https://api.example.test",
        fetcher,
      });

      const result = handleMessage(message);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" });
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [400, "BAD_REQUEST"],
    [413, "PAYLOAD_TOO_LARGE"],
    [429, "RATE_LIMITED"],
    [503, "SERVER_ERROR"],
  ])(
    "maps HTTP %i without reading or exposing the response body",
    async (status, code) => {
      const body = vi.fn(async () => ({ private: "server detail" }));
      const fetcher = vi.fn<typeof fetch>(
        async () => ({ ok: false, status, json: body }) as unknown as Response,
      );
      const handleMessage = createAnalysisMessageHandler({
        baseUrl: "https://api.example.test",
        fetcher,
      });

      await expect(handleMessage(message)).resolves.toEqual({
        ok: false,
        code,
      });
      expect(body).not.toHaveBeenCalled();
    },
  );
});
