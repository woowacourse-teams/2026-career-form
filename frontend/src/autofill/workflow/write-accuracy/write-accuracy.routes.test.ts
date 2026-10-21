import { afterEach, expect, it } from "vitest";
import { resolveDocumentCompany } from "../../adapters/company";
import { installExecutionPolicy } from "../execution-policy";
import { loadSnapshot, manifest, measurementEntries } from "./fixtures";
import { checkSnapshotRoute } from "./runner";

afterEach(() => {
  installExecutionPolicy(document);
  document.head.replaceChildren();
  document.body.replaceChildren();
});

for (const entry of manifest.filter(
  ({ status }) => status === "NOT_GENERIC_ROUTE",
)) {
  it(entry.snapshot, () => {
    loadSnapshot(entry);
    expect(measurementEntries).not.toContain(entry);
    expect(entry.expectedRoute).not.toBe("generic");
    if (entry.routeCheck === "ASSERTED") {
      expect(resolveDocumentCompany(document)).toBe(entry.expectedRoute);
      expect(checkSnapshotRoute(entry, document)).toEqual([]);
      installExecutionPolicy(document);
      expect(checkSnapshotRoute(entry, document)).toEqual(["ROUTE_MISMATCH"]);
    } else {
      // The scrubbed fixture lacks its fingerprint scripts. Do not fake a route.
      expect(entry.routeCheck).toBe("NOT_REPRODUCIBLE_OFFLINE");
      expect(checkSnapshotRoute(entry, document)).toEqual([]);
    }
  });
}
