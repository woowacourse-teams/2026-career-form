import { afterEach, expect, it, vi } from "vitest";
import { BackgroundQualityReporting } from "./background-reporting";

const source = {
  id: "extension",
  tab: { id: 1 },
  frameId: 0,
  documentId: "document",
};
const run = "a".repeat(32);
const payload = {
  eventId: "event",
  snapshotId: "snapshot",
  fields: {},
  identities: {},
  finished: null,
};
const receipt = (id = "b".repeat(32)) =>
  new Response(null, {
    headers: {
      "X-Career-Form-Run": id,
      "X-Career-Form-Report-Token": "c".repeat(64),
    },
  });
const state = {
  bound: true,
  attempted: true,
  written: true,
  retained: false,
  reason: "RETENTION_UNOBSERVED",
};

afterEach(() => vi.useRealTimers());

it.each([
  null,
  { ...payload, privateValue: "synthetic" },
  { ...payload, eventId: "" },
  { ...payload, snapshotId: "s".repeat(257) },
  { ...payload, finished: "RUNNING" },
  { ...payload, fields: [] },
  { ...payload, identities: [] },
  { ...payload, fields: { candidate: { ...state, rawValue: "synthetic" } } },
  { ...payload, fields: { candidate: { ...state, attempted: "true" } } },
  { ...payload, fields: { candidate: { ...state, reason: "private reason" } } },
  { ...payload, fields: { ["c".repeat(257)]: state } },
  { ...payload, fields: { candidate: null } },
  { ...payload, identities: { candidate: "raw DOM id" } },
  { ...payload, identities: { candidate: 1 } },
  { ...payload, identities: { candidate: "e1".repeat(2000) } },
  { ...payload, identities: { ["c".repeat(257)]: "e1" } },
  {
    ...payload,
    fields: Object.fromEntries(
      Array.from({ length: 2001 }, (_, n) => [String(n), state]),
    ),
  },
])(
  "잘못된 보고 계약과 비허용 데이터를 서버에 보내지 않는다 (%#)",
  async (invalid) => {
    const fetcher = vi.fn();
    const reporting = new BackgroundQualityReporting(
      "https://api.synthetic.test",
      fetcher,
      "extension",
    );
    reporting.capture(reporting.owner(run, source), receipt());
    expect(
      await reporting.report(
        { type: "AUTOFILL_QUALITY_REPORT", qualityRun: run, payload: invalid },
        source,
      ),
    ).toEqual({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("수신 문서와 응답 실행 소속을 검증하고 24시간 뒤 토큰을 재사용하지 않는다", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  const reporting = new BackgroundQualityReporting(
    "https://api.synthetic.test",
    fetcher,
    "extension",
  );
  expect(reporting.owner(run, { ...source, id: "foreign" })).toBeUndefined();
  expect(reporting.owner("invalid", source)).toBeUndefined();
  expect(reporting.owner(run)).toBeUndefined();
  const owner = reporting.owner(run, source);
  expect(reporting.headers(owner)).toEqual({});
  expect(reporting.capture(undefined, receipt())).toBe(false);
  expect(reporting.capture(owner, new Response())).toBe(false);
  expect(reporting.capture(owner, receipt("invalid"))).toBe(false);
  expect(
    reporting.capture(
      owner,
      new Response(null, { headers: { "X-Career-Form-Run": "b".repeat(32) } }),
    ),
  ).toBe(false);
  expect(reporting.capture(owner, receipt())).toBe(true);
  expect(reporting.capture(owner, receipt("d".repeat(32)))).toBe(false);
  expect(reporting.headers(owner)["X-Career-Form-Run"]).toBe("b".repeat(32));
  vi.advanceTimersByTime(86400000);
  expect(reporting.headers(owner)).toEqual({});
  expect(
    await reporting.report(
      { type: "AUTOFILL_QUALITY_REPORT", qualityRun: run, payload },
      source,
    ),
  ).toEqual({ ok: false });
});

it("보고 네트워크 실패만 같은 이벤트로 한 번 재시도하고 실패를 입력 흐름으로 던지지 않는다", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const reporting = new BackgroundQualityReporting(
    "https://api.synthetic.test",
    fetcher,
    "extension",
  );
  reporting.capture(reporting.owner(run, source), receipt());
  const message = {
    type: "AUTOFILL_QUALITY_REPORT",
    qualityRun: run,
    payload: {
      ...payload,
      fields: { candidate: state },
      identities: { candidate: "e1" },
    },
  };
  expect(await reporting.report(message, source)).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  fetcher.mockReset().mockRejectedValue(new Error("offline"));
  expect(await reporting.report(message, source)).toEqual({ ok: false });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("계약 크기가 한도를 넘거나 endpoint가 없으면 전송하지 않는다", async () => {
  const fetcher = vi.fn();
  for (const url of ["", "https://api.synthetic.test"]) {
    const reporting = new BackgroundQualityReporting(url, fetcher, "extension");
    reporting.capture(reporting.owner(run, source), receipt());
    const fields = Object.fromEntries(
      Array.from({ length: 600 }, (_, n) => [
        String(n).padEnd(256, "a"),
        state,
      ]),
    );
    expect(
      await reporting.report(
        {
          type: "AUTOFILL_QUALITY_REPORT",
          qualityRun: run,
          payload: { ...payload, fields },
        },
        source,
      ),
    ).toEqual({ ok: false });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
