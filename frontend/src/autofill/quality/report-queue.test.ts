import { afterEach, expect, it, vi } from "vitest";
import { QualityReportQueue } from "./report-queue";
import type { QualityReport, QualityState } from "./observation";
import type { QualityBatch } from "./report-batch";

afterEach(() => vi.useRealTimers());

const written: QualityState = {
  bound: true,
  attempted: true,
  written: true,
  retained: false,
  reason: "RETENTION_UNOBSERVED",
};

function reporting() {
  const messages: { qualityRun: string; payload: QualityBatch }[] = [];
  const queue = new QualityReportQueue(async (message) => {
    messages.push(message as (typeof messages)[number]);
  });
  return { queue, messages };
}

it("시간이 지나도 진행 중에는 보내지 않고 최종 관측과 종료 상태를 한 번에 보낸다", async () => {
  vi.useFakeTimers();
  const { queue, messages } = reporting();
  queue.enqueue("run", "snapshot", { c1: written }, { c1: "e1" }, null);
  await vi.advanceTimersByTimeAsync(1100);
  expect(messages).toHaveLength(0);
  queue.enqueue(
    "run",
    "snapshot",
    { c1: { ...written, retained: true, reason: null } },
    {},
    null,
  );
  queue.enqueue("run", "snapshot", {}, {}, "COMPLETED");
  await queue.drain();
  expect(messages).toHaveLength(1);
  expect(messages[0].payload.reports[0]).toMatchObject({
    snapshotId: "snapshot",
    identities: { c1: "e1" },
    fields: { c1: { ...written, retained: true, reason: null } },
    finished: "COMPLETED",
  });
});

it("여러 snapshot과 300개 초과 필드를 한 배치에 담고 마지막에만 종료 상태를 넣는다", async () => {
  const { queue, messages } = reporting();
  const fields = Object.fromEntries(
    Array.from({ length: 301 }, (_, i) => [`c${i}`, written]),
  );
  const identities = Object.fromEntries(
    Array.from({ length: 301 }, (_, i) => [`c${i}`, `e${i + 1}`]),
  );
  queue.enqueue(
    "run",
    "first",
    { previous: written },
    { previous: "e999" },
    null,
  );
  queue.enqueue("run", "second", fields, identities, null);
  queue.enqueue("run", "second", {}, {}, "COMPLETED");
  await queue.drain();
  expect(messages).toHaveLength(1);
  const reports = messages[0].payload.reports;
  expect(reports.map((report) => report.finished)).toEqual([null, "COMPLETED"]);
  expect(reports.map((report) => Object.keys(report.fields).length)).toEqual([
    1, 301,
  ]);
  expect(reports[1].identities).toEqual(identities);
  expect(reports[1].fields).toEqual(fields);
});

it("한 실행을 종료해도 다른 실행의 진행 중 관측은 보내지 않는다", async () => {
  const { queue, messages } = reporting();
  queue.enqueue("old", "snapshot", { old: written }, {}, null);
  queue.enqueue("new", "snapshot", { next: written }, {}, null);
  queue.enqueue("old", "snapshot", {}, {}, "CANCELLED");
  await queue.drain();
  expect(messages.map((message) => message.qualityRun)).toEqual(["old"]);
  queue.enqueue("new", "snapshot", {}, {}, "COMPLETED");
  await queue.drain();
  expect(messages.map((message) => message.qualityRun)).toEqual(["old", "new"]);
});

it("관측이 없는 실행도 종료 상태를 한 번 보낸다", async () => {
  const { queue, messages } = reporting();
  queue.enqueue("run", null, {}, {}, "CANCELLED");
  await queue.drain();
  expect(messages).toHaveLength(1);
  expect(messages[0].payload.reports[0]).toMatchObject({
    snapshotId: null,
    fields: {},
    identities: {},
    finished: "CANCELLED",
  });
});

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
  queue.enqueue("a".repeat(32), "snapshot", {}, {}, "COMPLETED");
  await queue.drain();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        reports: [
          expect.objectContaining({
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
        ],
      },
    }),
  );
});

it("bounds queued reports while an earlier background message is stalled", async () => {
  let release!: () => void;
  let sent = 0;
  const queue = new QualityReportQueue(async () => {
    sent++;
    if (sent === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  for (let index = 0; index < 100; index++)
    queue.enqueue(`run-${index}`, null, {}, {}, "COMPLETED");
  await Promise.resolve();
  release();
  await queue.drain();
  expect(sent).toBe(64);
});

it("50개 스냅샷의 작은 보고를 실행당 한 번의 배치로 전달한다", async () => {
  const { queue, messages } = reporting();
  for (let index = 0; index < 50; index++)
    queue.enqueue(
      "run",
      `snapshot-${index}`,
      { c1: written },
      { c1: "e1" },
      null,
    );
  queue.enqueue("run", "snapshot-49", {}, {}, "COMPLETED");
  await queue.drain();
  expect(messages).toHaveLength(1);
  const batch = messages[0].payload as unknown as { reports: QualityReport[] };
  expect(batch.reports).toHaveLength(50);
  expect(batch.reports[0]).toMatchObject({
    snapshotId: "snapshot-0",
    fields: { c1: written },
    finished: null,
  });
  expect(batch.reports[49]).toMatchObject({
    snapshotId: "snapshot-49",
    finished: "COMPLETED",
  });
});
