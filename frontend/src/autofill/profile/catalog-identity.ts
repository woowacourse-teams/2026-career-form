import {
  CATALOG,
  CATALOG_VERSION,
  getCatalogEntry,
  type CatalogEntry,
} from "../../profile/catalog";
import type { Profile, ProfileIdentity } from "../../profile/model";
import { catalogLabels } from "../../profile/catalog-search";

const kinds: Readonly<Record<string, CatalogEntry["kind"]>> = {
  "certifications.certificate.name": "certificate",
  "languages.languageTest.testName": "languageTest",
  "education.highSchool.schoolName": "highSchool",
  "education.university.schoolName": "university",
  "education.graduateSchool.schoolName": "graduateSchool",
};

/** Capture only the explicitly bound entry; no string-to-identity inference. */
export function bindSearchIdentity(
  profile: Profile,
  key: string,
  entryId: string | undefined,
  value: string,
): ProfileIdentity | undefined {
  if (!kinds[key]) return undefined;
  const [category, section, field] = key.split(".");
  const entries =
    category === "education"
      ? profile.education
      : category === "languages"
        ? profile.languages
        : profile.certifications;
  const sectionEntries = entries.filter((entry) => entry.sectionId === section);
  if (!entryId && sectionEntries.length !== 1) return undefined;
  const matches = sectionEntries.filter(
    (entry) =>
      (entryId === undefined || entry.id === entryId) &&
      entry.values[field]?.trim() === value,
  );
  if (matches.length !== 1 || !matches[0].identity) return undefined;
  return Object.freeze({ ...matches[0].identity });
}

export function verifiedSearchCatalogEntry(
  identity: ProfileIdentity,
  key: string | undefined,
  value: string | undefined,
): CatalogEntry | undefined {
  if (
    identity.status !== "selected" ||
    !key ||
    identity.catalogVersion !== CATALOG_VERSION
  )
    return undefined;
  const entry = getCatalogEntry(identity.catalogId);
  return entry &&
    entry.kind === kinds[key] &&
    entry.name === identity.displayName &&
    entry.name === value
    ? entry
    : undefined;
}

export function normalizedCatalogLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("en-US");
}

const labelEntries = new Map<string, Set<CatalogEntry>>();
for (const entry of CATALOG) {
  for (const label of catalogLabels(entry)) {
    const key = `${entry.kind}:${normalizedCatalogLabel(label)}`;
    const entries = labelEntries.get(key) ?? new Set<CatalogEntry>();
    entries.add(entry);
    labelEntries.set(key, entries);
  }
}

/** Reject even a sole DOM result when its label identifies multiple catalog entries. */
export function matchesCatalogLabel(
  entry: CatalogEntry,
  label: string,
): boolean {
  const candidates = [
    ...(labelEntries.get(`${entry.kind}:${normalizedCatalogLabel(label)}`) ??
      []),
  ].filter(
    (candidate) =>
      entry.kind === "certificate" ||
      entry.kind === "languageTest" ||
      normalizedCatalogLabel(candidate.detail) ===
        normalizedCatalogLabel(entry.detail),
  );
  return candidates.length === 1 && candidates[0].id === entry.id;
}
