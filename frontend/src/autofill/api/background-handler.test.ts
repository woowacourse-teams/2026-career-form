import { describe, expect, it, vi } from "vitest";

import { createAnalysisMessageHandler } from "./background-handler";
import { isAnalysisRequestMessage } from "./messages";

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
  it("negotiates preparation capabilities including Greeting execution", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ snapshotId: "preparation-1" }), {
          status: 200,
        }),
    );
    const handleMessage = createAnalysisMessageHandler({
      baseUrl: "https://api.example.test",
      fetcher,
    });

    await handleMessage({
      type: "AUTOFILL_ANALYZE_PREPARATION",
      payload: {
        schemaVersion: 2,
        snapshotId: "preparation-1",
        site: {
          host: "career.hyundai-autoever.com",
          pathPattern: "/ko/o/*/apply",
        },
        sections: [{ sectionId: "section-root", actionCandidates: [] }],
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/preparation/analyze",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Career-Form-Capabilities": "address-search-v1",
        },
      }),
    );
  });
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
        headers: {
          "Content-Type": "application/json",
        },
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

const genericSite = { host: "example.test", pathPattern: "/apply" };
const classifyMessage = {
  type: "AUTOFILL_GENERIC_CLASSIFY_SECTIONS" as const,
  payload: {
    schemaVersion: 1 as const,
    snapshotId: "classify-1",
    site: genericSite,
    sections: [
      {
        sectionId: "secA",
        labels: ["합성 라벨"],
        controlKinds: ["TEXT" as const],
        repeated: false,
      },
    ],
  },
};
const genericFieldsMessage = {
  type: "AUTOFILL_GENERIC_ANALYZE_FIELDS" as const,
  payload: {
    schemaVersion: 2 as const,
    snapshotId: "generic-1",
    site: genericSite,
    sections: [
      {
        sectionId: "secA",
        category: "contact",
        fields: [
          {
            candidateId: "c1",
            element: "input" as const,
            control: "text" as const,
            visibility: "visible" as const,
          },
        ],
      },
    ],
  },
};
const interactionMessage = {
  type: "AUTOFILL_DECIDE_INTERACTIONS" as const,
  payload: {
    schemaVersion: 2 as const,
    snapshotId: "interaction-1",
    site: genericSite,
    decisions: [],
  },
};

function hangingFetcher() {
  const state = { aborted: false };
  const fetcher = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          state.aborted = true;
          reject(new DOMException("The request was aborted", "AbortError"));
        });
      }),
  );
  return { fetcher, state };
}

describe("generic analysis background routes", () => {
  it.each([
    [classifyMessage, "/api/v1/generic/sections/classify"],
    [genericFieldsMessage, "/api/v1/generic/fields/analyze"],
  ] as const)(
    "posts %#-th generic message to its fixed endpoint with the payload body",
    async (generic, path) => {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ snapshotId: generic.payload.snapshotId }),
            {
              status: 200,
            },
          ),
      );
      const handleMessage = createAnalysisMessageHandler({
        baseUrl: "https://api.example.test/",
        fetcher,
      });

      await expect(handleMessage(generic)).resolves.toEqual({
        ok: true,
        data: { snapshotId: generic.payload.snapshotId },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        `https://api.example.test${path}`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generic.payload),
        }),
      );
    },
  );

  it.each([classifyMessage, genericFieldsMessage])(
    "uses the default 60 second timeout for %#-th generic message",
    async (generic) => {
      vi.useFakeTimers();
      try {
        const { fetcher, state } = hangingFetcher();
        const handleMessage = createAnalysisMessageHandler({
          baseUrl: "https://api.example.test",
          fetcher,
        });

        const result = handleMessage(generic);
        await vi.advanceTimersByTimeAsync(59_999);
        expect(state.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" });
        expect(state.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("keeps the 8 second cap for interaction decisions", async () => {
    vi.useFakeTimers();
    try {
      const { fetcher, state } = hangingFetcher();
      const handleMessage = createAnalysisMessageHandler({
        baseUrl: "https://api.example.test",
        fetcher,
      });

      const result = handleMessage(interactionMessage);
      await vi.advanceTimersByTimeAsync(7_999);
      expect(state.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" });
      expect(state.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledWith(
        "https://api.example.test/api/v1/generic/interaction-decisions",
        expect.anything(),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("analysis request message guard", () => {
  const withVersion = (
    type: string,
    payload: { schemaVersion: number; snapshotId: string },
    schemaVersion: number,
  ) => ({ type, payload: { ...payload, schemaVersion } });

  it("accepts section classification only with schemaVersion 1", () => {
    expect(isAnalysisRequestMessage(classifyMessage)).toBe(true);
    expect(
      isAnalysisRequestMessage(
        withVersion(classifyMessage.type, classifyMessage.payload, 2),
      ),
    ).toBe(false);
  });

  it("accepts generic field matching only with schemaVersion 2", () => {
    expect(isAnalysisRequestMessage(genericFieldsMessage)).toBe(true);
    expect(
      isAnalysisRequestMessage(
        withVersion(genericFieldsMessage.type, genericFieldsMessage.payload, 1),
      ),
    ).toBe(false);
  });

  it.each([
    "AUTOFILL_ANALYZE_PREPARATION",
    "AUTOFILL_ANALYZE_FIELDS",
    "AUTOFILL_DECIDE_INTERACTIONS",
  ])("keeps %s limited to schemaVersion 2", (type) => {
    const payload = { schemaVersion: 2, snapshotId: "snapshot-1" };
    expect(isAnalysisRequestMessage({ type, payload })).toBe(true);
    expect(isAnalysisRequestMessage(withVersion(type, payload, 1))).toBe(false);
    expect(isAnalysisRequestMessage(withVersion(type, payload, 3))).toBe(false);
    expect(
      isAnalysisRequestMessage({ type, payload: { schemaVersion: 2 } }),
    ).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(
      isAnalysisRequestMessage({
        type: "AUTOFILL_GENERIC_UNKNOWN",
        payload: { schemaVersion: 1, snapshotId: "x" },
      }),
    ).toBe(false);
  });
});
