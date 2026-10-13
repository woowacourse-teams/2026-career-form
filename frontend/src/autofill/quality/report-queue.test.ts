import { afterEach, expect, it, vi } from "vitest";
import { QualityReportQueue } from "./report-queue";
import type { QualityReport, QualityState } from "./observation";

afterEach(() => vi.useRealTimers());

const written: QualityState = {
  bound: true,
  attempted: true,
  written: true,
  retained: false,
  reason: "RETENTION_UNOBSERVED",
};

function reporting() {
  const messages: { qualityRun: string; payload: QualityReport }[] = [];
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
  expect(messages[0].payload).toMatchObject({
    snapshotId: "snapshot",
    identities: { c1: "e1" },
    fields: { c1: { ...written, retained: true, reason: null } },
    finished: "COMPLETED",
  });
});

it("여러 snapshot과 300개 초과 필드를 빠짐없이 보내고 마지막에만 종료 상태를 넣는다", async () => {
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
  expect(messages).toHaveLength(3);
  expect(messages.map(({ payload }) => payload.finished)).toEqual([
    null,
    null,
    "COMPLETED",
  ]);
  expect(
    messages.map(({ payload }) => Object.keys(payload.fields).length),
  ).toEqual([1, 300, 1]);
  expect(messages[1].payload.identities).toEqual(identities);
  expect(messages[2].payload.identities).toEqual({});
  expect(
    Object.assign(
      {},
      ...messages.slice(1).map(({ payload }) => payload.fields),
    ),
  ).toEqual(fields);
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
  expect(messages[0].payload).toMatchObject({
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
