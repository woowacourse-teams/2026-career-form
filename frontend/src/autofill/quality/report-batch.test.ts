import { expect, it } from "vitest";
import { batchReports } from "./report-batch";
import type { QualityState } from "./observation";

const state: QualityState = {
  bound: true,
  attempted: true,
  written: true,
  retained: true,
  reason: null,
};

it("한글과 이스케이프가 포함된 필드도 실제 UTF8 본문 한도 안에서 빠짐없이 분할한다", () => {
  const fields = Object.fromEntries(
    Array.from({ length: 400 }, (_, index) => [
      `${index}-${"가".repeat(120)}\\\"`,
      state,
    ]),
  );
  const identities = Object.fromEntries(
    Object.keys(fields).map((id, index) => [id, `e${index + 1}`]),
  );
  const batches = batchReports(
    [{ snapshotId: "snapshot", fields, identities }],
    "COMPLETED",
  );
  expect(batches.length).toBeGreaterThan(1);
  for (const batch of batches)
    expect(
      new TextEncoder().encode(JSON.stringify(batch)).length,
    ).toBeLessThanOrEqual(131072);
  const reports = batches.flatMap((batch) => batch.reports);
  expect(Object.assign({}, ...reports.map((report) => report.fields))).toEqual(
    fields,
  );
  expect(
    Object.assign({}, ...reports.map((report) => report.identities)),
  ).toEqual(identities);
  expect(reports.filter((report) => report.finished !== null)).toEqual([
    expect.objectContaining({ finished: "COMPLETED" }),
  ]);
  expect(reports.at(-1)?.finished).toBe("COMPLETED");
  expect(new Set(reports.map((report) => report.eventId)).size).toBe(
    reports.length,
  );
});

it("개별 항목이 본문보다 크면 버리고 종료 보고는 한 번 유지한다", () => {
  const batches = batchReports(
    [
      {
        snapshotId: "snapshot",
        fields: { c1: state },
        identities: { c1: "e".repeat(140000) },
      },
    ],
    "CANCELLED",
  );
  expect(batches).toHaveLength(1);
  expect(batches[0].reports).toEqual([
    expect.objectContaining({
      fields: {},
      identities: {},
      finished: "CANCELLED",
    }),
  ]);
});
