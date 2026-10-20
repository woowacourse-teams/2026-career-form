import type { QualityReport, QualityState } from "./observation";
import { qualityIdentity } from "./identity";

export interface QualityBatch {
  reports: QualityReport[];
}
export interface SnapshotReport {
  snapshotId: string | null;
  fields: Record<string, QualityState>;
  identities: Record<string, string>;
}
const maximum = 128 * 1024;
const length = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

const fresh = (snapshotId: string | null): QualityReport => ({
  eventId: qualityIdentity(),
  snapshotId,
  fields: {},
  identities: {},
  finished: null,
});

function fragments(snapshot: SnapshotReport): QualityReport[] {
  const reports: QualityReport[] = [];
  let metadata = fresh(snapshot.snapshotId);
  let fields: [string, QualityState][] = [];
  let identities: [string, string][] = [];
  const collect = () => ({
    ...metadata,
    fields: Object.fromEntries(fields),
    identities: Object.fromEntries(identities),
  });
  let bytes = length(metadata) + 7 + length({ reports: [] });
  for (const id of new Set([
    ...Object.keys(snapshot.fields),
    ...Object.keys(snapshot.identities),
  ])) {
    const field = snapshot.fields[id];
    const identity = snapshot.identities[id];
    const cost =
      (field ? length({ [id]: field }) - 2 : 0) +
      (identity ? length({ [id]: identity }) - 2 : 0);
    if (
      fields.length >= 2000 ||
      identities.length >= 2000 ||
      bytes +
        cost +
        (field && fields.length ? 1 : 0) +
        (identity && identities.length ? 1 : 0) >
        maximum
    ) {
      if (fields.length || identities.length) reports.push(collect());
      metadata = fresh(snapshot.snapshotId);
      fields = [];
      identities = [];
      bytes = length(metadata) + 7 + length({ reports: [] });
    }
    const extra =
      (field && fields.length ? 1 : 0) +
      (identity && identities.length ? 1 : 0);
    if (bytes + cost + extra > maximum) continue;
    if (field) fields.push([id, field]);
    if (identity) identities.push([id, identity]);
    bytes += cost + extra;
  }
  if (fields.length || identities.length) reports.push(collect());
  return reports;
}

function pack(reports: readonly QualityReport[]): QualityBatch[] {
  const batches: QualityBatch[] = [];
  let batch: QualityReport[] = [];
  let bytes = length({ reports: [] });
  for (const report of reports) {
    const size = length(report);
    if (
      bytes + size + (batch.length ? 1 : 0) > maximum ||
      batch.length >= 200
    ) {
      if (batch.length) batches.push({ reports: batch });
      batch = [];
      bytes = length({ reports: [] });
    }
    if (bytes + size > maximum) continue;
    batch = [...batch, report];
    bytes += size + (batch.length > 1 ? 1 : 0);
  }
  if (batch.length) batches.push({ reports: batch });
  return batches;
}

export function batchReports(
  source: readonly SnapshotReport[],
  finished: NonNullable<QualityReport["finished"]>,
): QualityBatch[] {
  const fragmentsBySnapshot = source.flatMap(fragments);
  const reports = fragmentsBySnapshot.length
    ? fragmentsBySnapshot
    : [fresh(source.at(-1)?.snapshotId ?? null)];
  return pack(
    reports.map((report, index) =>
      index === reports.length - 1 ? { ...report, finished } : report,
    ),
  );
}
