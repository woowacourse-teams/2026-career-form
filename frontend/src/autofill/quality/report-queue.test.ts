import { expect, it, vi } from "vitest";
import { QualityReportQueue } from "./report-queue";

it("뒤늦은 값 준비 실패가 이미 확인한 값 준비와 사유를 모순되게 만들지 않는다", async () => {
  const send = vi.fn(async () => undefined);
  const queue = new QualityReportQueue(send);
  queue.enqueue(
    "a".repeat(32),
    "snapshot",
    {
      candidate: {
        bound: true,
        attempted: false,
        written: false,
        retained: false,
        reason: "NOT_APPROVED",
      },
    },
    {},
    null,
  );
  queue.enqueue(
    "a".repeat(32),
    "snapshot",
    {
      candidate: {
        bound: false,
        attempted: false,
        written: false,
        retained: false,
        reason: "PROFILE_VALUE_MISSING",
      },
    },
    {},
    null,
  );
  await queue.drain();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        fields: {
          candidate: {
            bound: true,
            attempted: false,
            written: false,
            retained: false,
            reason: "NOT_APPROVED",
          },
        },
      }),
    }),
  );
});
