import { describe, expect, it, vi } from "vitest";
import { createAnalysisMessageHandler } from "./background-handler";

const sender = {
  id: "synthetic-extension",
  tab: { id: 1 },
  frameId: 0,
  documentId: "synthetic-document",
};
const run = "a".repeat(32);
const message = {
  type: "AUTOFILL_ANALYZE_FIELDS",
  qualityRun: run,
  payload: { schemaVersion: 2, snapshotId: "snapshot" },
};
const report = {
  type: "AUTOFILL_QUALITY_REPORT",
  qualityRun: run,
  payload: {
    eventId: "event1",
    snapshotId: "snapshot",
    fields: {},
    identities: {},
    finished: "COMPLETED",
  },
};

describe("백그라운드 품질 보고 토큰의 소속", () => {
  it("서버 토큰을 응답 메시지에 노출하지 않고 같은 문서의 보고에만 쓴다", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/executions"))
        return new Response(
          JSON.stringify({
            runId: "b".repeat(32),
            token: "c".repeat(64),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
          { status: 201 },
        );
      if (String(input).endsWith("/report"))
        return new Response(null, { status: 202 });
      return new Response('{"snapshotId":"snapshot"}');
    });
    const handle = createAnalysisMessageHandler({
      baseUrl: "https://backend.synthetic.test",
      fetcher,
      extensionId: sender.id,
      extensionVersion: "0.1.0",
    });
    const response = await handle(message, sender);
    expect(response).toEqual({
      ok: true,
      data: { snapshotId: "snapshot" },
    });
    expect(JSON.stringify(response)).not.toContain("c".repeat(64));
    expect(
      await handle(report, { ...sender, documentId: "foreign-document" }),
    ).toEqual({ ok: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await handle(report, sender)).toEqual({ ok: true });
    expect(fetcher.mock.calls[2]?.[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer " + "c".repeat(64) }),
    );
  });

  it("구형 서버와 보고 오류가 기존 분석 응답을 바꾸지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/executions")
        ? new Response(null, { status: 404 })
        : new Response('{"snapshotId":"snapshot"}'),
    );
    const handle = createAnalysisMessageHandler({
      baseUrl: "https://backend.synthetic.test",
      fetcher,
      extensionId: sender.id,
    });
    expect(await handle(message, sender)).toEqual({
      ok: true,
      data: { snapshotId: "snapshot" },
    });
    expect(await handle(report, sender)).toEqual({ ok: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("입력값이나 임의 사유 문자열이 들어간 보고를 보내지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handle = createAnalysisMessageHandler({
      baseUrl: "https://backend.synthetic.test",
      fetcher,
      extensionId: sender.id,
    });
    expect(
      await handle(
        {
          ...report,
          payload: {
            ...report.payload,
            fields: {
              c1: {
                bound: true,
                attempted: true,
                written: false,
                retained: false,
                reason: "synthetic-private-value",
              },
            },
          },
        },
        sender,
      ),
    ).toEqual({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
