import { expect, it, vi } from "vitest";
import { createAnalysisMessageHandler } from "./background-handler";

const source = {
  id: "extension",
  tab: { id: 1 },
  frameId: 0,
  documentId: "doc",
};
const qualityRun = "a".repeat(32);
const message = {
  type: "AUTOFILL_ANALYZE_FIELDS",
  qualityRun,
  payload: {
    schemaVersion: 2,
    snapshotId: "snapshot",
    site: { host: "synthetic.test", pathPattern: "/apply" },
    sections: [],
  },
};

it("returns analysis without waiting for registration and links an early report afterwards", async () => {
  let release!: (response: Response) => void;
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith("/executions"))
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    if (request.url.endsWith("/report"))
      return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ snapshotId: "snapshot" }), {
      status: 200,
    });
  };
  const handle = createAnalysisMessageHandler({
    baseUrl: "https://synthetic.test",
    fetcher,
    extensionId: "extension",
  });
  expect(await handle(message, source)).toEqual({
    ok: true,
    data: { snapshotId: "snapshot" },
  });
  expect(requests).toHaveLength(2);
  const body = await requests[0].json();
  expect(requests[1].headers.get("X-Career-Form-Quality-Run")).toBe(qualityRun);
  expect(requests[1].headers.get("X-Career-Form-Quality-Key")).toBe(body.key);
  const reported = handle(
    {
      type: "AUTOFILL_QUALITY_REPORT",
      qualityRun,
      payload: {
        eventId: "event",
        snapshotId: null,
        fields: {},
        identities: {},
        finished: "COMPLETED",
      },
    },
    source,
  );
  release(
    new Response(
      JSON.stringify({
        runId: "b".repeat(32),
        token: "c".repeat(64),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
      { status: 201 },
    ),
  );
  expect(await reported).toEqual({ ok: true });
  expect(requests).toHaveLength(3);
  expect(requests[2].headers.get("Authorization")).toBe(
    `Bearer ${"c".repeat(64)}`,
  );
});

it("keeps analysis available against a server without the registration endpoint", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith("/executions")
      ? new Response(null, { status: 404 })
      : new Response(JSON.stringify({ snapshotId: "snapshot" })),
  );
  const handle = createAnalysisMessageHandler({
    baseUrl: "https://synthetic.test",
    fetcher,
    extensionId: "extension",
  });
  expect(await handle(message, source)).toEqual({
    ok: true,
    data: { snapshotId: "snapshot" },
  });
  expect(
    await handle(
      {
        type: "AUTOFILL_QUALITY_REPORT",
        qualityRun,
        payload: {
          eventId: "event",
          snapshotId: null,
          fields: {},
          identities: {},
          finished: "COMPLETED",
        },
      },
      source,
    ),
  ).toEqual({ ok: false });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
