import type {
  SnapshotManifestEntry,
  AccuracyMetrics,
  AccuracyReport,
} from "./schema";
import { emptyMetrics } from "./schema";
import { isMeasured } from "./manifest";

export function addMetrics(
  target: AccuracyMetrics,
  source: AccuracyMetrics,
): void {
  for (const key of Object.keys(target) as (keyof AccuracyMetrics)[])
    target[key] += source[key];
}

export function assertAccuracyReport(report: AccuracyReport): void {
  for (const metrics of [
    report.metrics,
    ...Object.values(report.byControlKind),
  ]) {
    if (
      metrics.attempted !== metrics.correct + metrics.wrong + metrics.held ||
      metrics.reportedSuccessButWrong > metrics.wrong
    )
      throw new Error(`METRIC_CONSERVATION:${report.snapshot}`);
  }
  const failed = [
    ...report.diagnostics,
    ...(report.metrics.wrong ? ["WRONG_VALUES"] : []),
    ...(report.metrics.unscored ? ["UNSCORED_FIELDS"] : []),
    ...(report.metrics.preservedViolated ? ["PRESERVE_VIOLATION"] : []),
  ];
  if (failed.length)
    throw new Error(`${report.snapshot}:${[...new Set(failed)].join(",")}`);
}

/** Only this invocation's in-memory reports participate, never prior evidence. */
export function aggregateAccuracy(
  entries: readonly SnapshotManifestEntry[],
  reports: ReadonlyMap<string, AccuracyReport>,
) {
  const expected = entries.filter(isMeasured).map((entry) => entry.snapshot);
  const missing = expected.filter((snapshot) => !reports.has(snapshot));
  const extra = [...reports.keys()].filter(
    (snapshot) => !expected.includes(snapshot),
  );
  const reviewed = emptyMetrics();
  const unreviewed = emptyMetrics();
  const failures: string[] = [];
  const byControlKind: Record<
    string,
    { reviewed: AccuracyMetrics; unreviewed: AccuracyMetrics }
  > = {};
  for (const entry of entries.filter(isMeasured)) {
    const report = reports.get(entry.snapshot);
    if (!report) continue;
    try {
      assertAccuracyReport(report);
    } catch {
      failures.push(entry.snapshot);
    }
    if (
      report.snapshot !== entry.snapshot ||
      report.status !== entry.status ||
      report.scored !== (entry.status === "RUNNABLE")
    )
      failures.push(entry.snapshot);
    const target = entry.status === "RUNNABLE" ? reviewed : unreviewed;
    addMetrics(target, report.metrics);
    for (const [kind, metrics] of Object.entries(report.byControlKind)) {
      const group = (byControlKind[kind] ??= {
        reviewed: emptyMetrics(),
        unreviewed: emptyMetrics(),
      });
      const kindTarget =
        entry.status === "RUNNABLE" ? group.reviewed : group.unreviewed;
      addMetrics(kindTarget, metrics);
    }
  }
  return {
    schemaVersion: 1,
    expected,
    missing,
    extra,
    failures: [...new Set(failures)],
    reviewed,
    unreviewed,
    byControlKind,
    excluded: entries
      .filter((entry) => !isMeasured(entry))
      .map(({ snapshot, status, reason, expectedRoute, routeCheck }) => ({
        snapshot,
        status,
        reason,
        expectedRoute,
        routeCheck,
      })),
  };
}
