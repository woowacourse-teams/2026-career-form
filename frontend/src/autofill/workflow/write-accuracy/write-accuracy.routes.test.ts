import { afterEach, expect, it } from "vitest";
import { resolveDocumentCompany } from "../../adapters/company";
import { installExecutionPolicy } from "../execution-policy";
import { loadSnapshot, loadTruth, manifest, measurementEntries } from "./fixtures";
import { assertManifestRoutes, isMeasured } from "./manifest";
import { aggregateAccuracy, checkSnapshotRoute } from "./runner";

afterEach(() => {
  installExecutionPolicy(document);
  document.head.replaceChildren();
  document.body.replaceChildren();
});

it("measures only entries whose expected route is generic", () => {
  expect(() => assertManifestRoutes(manifest)).not.toThrow();
  expect(
    manifest
      .filter((entry) => isMeasured(entry) && entry.expectedRoute !== "generic")
      .map(({ snapshot }) => snapshot),
  ).toEqual([]);
});

for (const entry of manifest.filter(
  ({ status }) => status === "NOT_GENERIC_ROUTE",
)) {
  it(entry.snapshot, () => {
    loadSnapshot(entry);
    expect(measurementEntries).not.toContain(entry);
    expect(entry.expectedRoute).not.toBe("generic");
    expect(loadTruth(entry.snapshot)).toBeUndefined();
    const aggregate = aggregateAccuracy(manifest, new Map());
    expect(aggregate.expected).not.toContain(entry.snapshot);
    expect(aggregate.excluded).toContainEqual(
      expect.objectContaining({
        snapshot: entry.snapshot,
        status: "NOT_GENERIC_ROUTE",
        routeCheck: entry.routeCheck,
      }),
    );
    if (entry.routeCheck === "ASSERTED") {
      expect(resolveDocumentCompany(document)).toBe(entry.expectedRoute);
      expect(checkSnapshotRoute(entry, document)).toEqual([]);
      installExecutionPolicy(document);
      expect(checkSnapshotRoute(entry, document)).toEqual(["ROUTE_MISMATCH"]);
    } else {
      // The scrubbed fixture lacks its fingerprint scripts. Do not fake a route.
      expect(entry.routeCheck).toBe("NOT_REPRODUCIBLE_OFFLINE");
      expect(entry.reason).toBe("ROUTE_FINGERPRINT_SANITIZED");
      expect(checkSnapshotRoute(entry, document)).toEqual([]);
    }
  });
}
