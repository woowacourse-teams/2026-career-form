import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Profile } from "../../../profile/model";
import profileJson from "../../../../fixtures/write-accuracy/profile.synthetic.json";
import { fixturePolicy } from "../../../test/fixtures/execution-policy";
import { installExecutionPolicy } from "../execution-policy";
import type { SnapshotManifestEntry } from "./schema";
export { manifest, measurementEntries } from "./manifest";
export { loadTruth } from "./truth";

export function syntheticProfile(): Profile {
  const { education, ...profile } = structuredClone(profileJson);
  return {
    ...profile,
    education: education.map(({ values, ...entry }) => ({
      ...entry,
      values: Object.fromEntries(
        Object.entries(values).filter(([, value]) => typeof value === "string"),
      ),
    })),
  };
}

export function loadSnapshot(entry: SnapshotManifestEntry): void {
  installExecutionPolicy(document);
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: entry.documentUrl });
  document.head.replaceChildren();
  document.body.innerHTML = readFileSync(
    join(
      process.cwd(),
      "fixtures/dom-snapshots",
      entry.snapshot,
      "sanitized.html",
    ),
    "utf8",
  );
  if (entry.policyFixture)
    installExecutionPolicy(document, fixturePolicy(entry.policyFixture));
}
