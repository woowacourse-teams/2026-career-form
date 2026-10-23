import { afterEach, expect, it, vi } from "vitest";
import { BackgroundQualityReporting } from "./background-reporting";

const source = {
  id: "extension",
  tab: { id: 1 },
  frameId: 0,
  documentId: "doc",
};
const run = "a".repeat(32);
const registration = () =>
  new Response(
    JSON.stringify({
      runId: "b".repeat(32),
      token: "c".repeat(64),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
    { status: 201 },
  );
const message = {
  type: "AUTOFILL_QUALITY_REPORT",
  qualityRun: run,
  payload: {
    eventId: "event",
    snapshotId: null,
    fields: {},
    identities: {},
    finished: "COMPLETED",
  },
};

afterEach(() => vi.useRealTimers());

it("registers once and holds early reports until credentials arrive", async () => {
  let resolve!: (response: Response) => void;
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    calls.push(String(input));
    return calls.length === 1
      ? new Promise<Response>((done) => {
          resolve = done;
        })
      : new Response(null, { status: 202 });
  };
  const reporting = new BackgroundQualityReporting(
    "https://synthetic.test",
    fetcher,
    "extension",
  );
  const owner = reporting.owner(run, source);
  reporting.start(owner);
  reporting.start(owner);
  expect(reporting.headers(owner)["X-Career-Form-Quality-Key"]).toMatch(
    /^[a-f0-9]{64}$/,
  );
  const pending = reporting.report(message, source);
  expect(calls).toHaveLength(1);
  resolve(registration());
  expect(await pending).toEqual({ ok: true });
  expect(calls).toHaveLength(2);
});

it("discards reports after 30 seconds and rejects late registration", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const reporting = new BackgroundQualityReporting(
    "https://synthetic.test",
    fetcher,
    "extension",
  );
  reporting.start(reporting.owner(run, source));
  const pending = reporting.report(message, source);
  await vi.advanceTimersByTimeAsync(30000);
  expect(await pending).toEqual({ ok: false });
  resolve(registration());
  await Promise.resolve();
  expect(await reporting.report(message, source)).toEqual({ ok: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([404, 429, 500])(
  "excludes reporting after registration HTTP %s without retry",
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const reporting = new BackgroundQualityReporting(
      "https://synthetic.test",
      fetcher,
      "extension",
    );
    reporting.start(reporting.owner(run, source));
    expect(await reporting.report(message, source)).toEqual({ ok: false });
    reporting.start(reporting.owner(run, source));
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("stops future reports after a lost server registration returns 401", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(registration())
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  const reporting = new BackgroundQualityReporting(
    "https://synthetic.test",
    fetcher,
    "extension",
  );
  reporting.start(reporting.owner(run, source));
  expect(await reporting.report(message, source)).toEqual({ ok: false });
  expect(await reporting.report(message, source)).toEqual({ ok: false });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("bounds early pending reports while registration is stalled", async () => {
  let release!: (response: Response) => void;
  const fetcher: typeof fetch = async (input) =>
    String(input).endsWith("/executions")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : new Response(null, { status: 202 });
  const reporting = new BackgroundQualityReporting(
    "https://synthetic.test",
    fetcher,
    "extension",
  );
  reporting.start(reporting.owner(run, source));
  const accepted = Array.from({ length: 64 }, () =>
    reporting.report(message, source),
  );
  expect(await reporting.report(message, source)).toEqual({ ok: false });
  release(registration());
  expect(await Promise.all(accepted)).toHaveLength(64);
});
