import manifestJson from "../../../../fixtures/write-accuracy/manifest.json";
import type { SnapshotManifestEntry } from "./schema";

export const manifest = manifestJson.snapshots as SnapshotManifestEntry[];
export const isMeasured = (entry: SnapshotManifestEntry) =>
  entry.status === "RUNNABLE" || entry.status === "UNREVIEWED";
export const measurementEntries = manifest.filter(isMeasured);

export function assertManifestRoutes(
  entries: readonly SnapshotManifestEntry[],
): void {
  if (new Set(entries.map((entry) => entry.snapshot)).size !== entries.length)
    throw new Error("Duplicate manifest snapshot");
  for (const entry of entries) {
    if (isMeasured(entry) && entry.expectedRoute !== "generic")
      throw new Error(`Non-generic measured route: ${entry.snapshot}`);
    if (
      entry.status === "NOT_GENERIC_ROUTE" &&
      (entry.expectedRoute === "generic" || !entry.routeCheck)
    )
      throw new Error(`Invalid excluded route: ${entry.snapshot}`);
  }
}
