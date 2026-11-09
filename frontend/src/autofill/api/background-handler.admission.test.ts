import { expect, it } from "vitest";
import { createAnalysisMessageHandler } from "./background-handler";

const message = {
  type: "AUTOFILL_ANALYZE_FIELDS",
  payload: {
    schemaVersion: 2,
    snapshotId: "synthetic",
    site: { host: "example.test", pathPattern: "/apply" },
    sections: [],
  },
};

it("sends installation credentials as headers without adding them to analysis data", async () => {
  let request: RequestInit | undefined;
  const handler = createAnalysisMessageHandler({
    baseUrl: "https://api.example.test",
    installation: {
      credentials: async () => ({
        installationId: "synthetic-install",
        token: "synthetic-token",
      }),
    },
    fetcher: async (_url, init) => {
      request = init;
      return Response.json({});
    },
  });
  await expect(handler(message)).resolves.toEqual({ ok: true, data: {} });
  expect(new Headers(request?.headers).get("Authorization")).toBe(
    "Bearer synthetic-token",
  );
  expect(new Headers(request?.headers).get("X-Career-Form-Installation")).toBe(
    "synthetic-install",
  );
  expect(request?.body).not.toContain("synthetic-token");
});

it("distinguishes an exhausted global budget from transient congestion", async () => {
  const handler = createAnalysisMessageHandler({
    baseUrl: "https://api.example.test",
    fetcher: async () =>
      Response.json(
        { code: "GLOBAL_LIMIT", retryAt: "2030-01-01T01:00:00Z" },
        {
          status: 429,
          headers: {
            "X-Career-Form-Admission": "GLOBAL_LIMIT",
            "X-Career-Form-Retry-At": "2030-01-01T01:00:00Z",
          },
        },
      ),
  });
  await expect(handler(message)).resolves.toEqual({
    ok: false,
    code: "GLOBAL_LIMIT",
    retryAt: "2030-01-01T01:00:00Z",
  });
});
