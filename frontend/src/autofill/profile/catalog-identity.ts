import {
  CATALOG,
  CATALOG_VERSION,
  getCatalogEntry,
  type CatalogEntry,
} from "../../profile/catalog";
import type { Profile, ProfileIdentity } from "../../profile/model";
import { catalogLabels } from "../../profile/catalog-search";
import {
  isApprovedCatalogMatch,
  normalizedCatalogLabel,
  type ApprovedCatalogMatch,
  type CatalogApproval,
} from "./catalog-match";
export { normalizedCatalogLabel } from "./catalog-match";

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

/** First detail segment of a KESS high school record: its sido abbreviation. */
function highSchoolRegion(entry: CatalogEntry): string | undefined {
  if (entry.kind !== "highSchool") return undefined;
  const region = entry.detail.split(" · ")[0]?.trim();
  return region || undefined;
}

/**
 * Greeting high-school options expose only the sido abbreviation. Accept it only
 * when name and sido together identify exactly this catalog entry.
 */
export function matchesCatalogHighSchoolRegion(
  entry: CatalogEntry,
  label: string,
  region: string,
): boolean {
  const own = highSchoolRegion(entry);
  if (!own || normalizedCatalogLabel(region) !== normalizedCatalogLabel(own))
    return false;
  const candidates = [
    ...(labelEntries.get(`${entry.kind}:${normalizedCatalogLabel(label)}`) ??
      []),
  ].filter((candidate) => highSchoolRegion(candidate) === own);
  return candidates.length === 1 && candidates[0].id === entry.id;
}

/** KESS school code shared by every campus record of one institution. */
function kessSchoolCode(entry: CatalogEntry): string | undefined {
  const [kind, source, code] = entry.id.split(":");
  return kind === entry.kind && source === "kess" && code ? code : undefined;
}

/**
 * Greeting university options name the institution without campus text. Accept
 * the name only when every catalog record with that label is the same school.
 */
export function matchesCatalogInstitution(
  entry: CatalogEntry,
  label: string,
): boolean {
  if (entry.kind !== "university" && entry.kind !== "graduateSchool")
    return false;
  const code = kessSchoolCode(entry);
  const candidates = [
    ...(labelEntries.get(`${entry.kind}:${normalizedCatalogLabel(label)}`) ??
      []),
  ];
  return (
    !!code &&
    candidates.some((candidate) => candidate.id === entry.id) &&
    candidates.every((candidate) => kessSchoolCode(candidate) === code)
  );
}

export function approveCatalogMatch(
  identity: ProfileIdentity | undefined,
  fieldKey: string,
  sourceValue: string,
): CatalogApproval {
  if (!identity || identity.status === "manual") return { status: "legacy" };
  const entry = verifiedSearchCatalogEntry(identity, fieldKey, sourceValue);
  if (!entry) return { status: "invalid" };
  const match: ApprovedCatalogMatch = {
    kind: entry.kind,
    query: sourceValue,
    labels: Object.freeze([
      ...new Set(
        catalogLabels(entry).filter((label) =>
          matchesCatalogLabel(entry, label),
        ),
      ),
    ]),
    ...(entry.kind === "certificate" || entry.kind === "languageTest"
      ? {}
      : { requiredDetail: entry.detail }),
  };
  return isApprovedCatalogMatch(match)
    ? { status: "selected", match: Object.freeze(match) }
    : { status: "invalid" };
}

/** Recreate approval locally so an edited review item cannot broaden its match. */
export function catalogApprovalForItem(item: {
  readonly searchIdentity?: ProfileIdentity;
  readonly catalogMatch?: ApprovedCatalogMatch;
  readonly profileFieldKey?: string;
  readonly profileValue?: string;
}): CatalogApproval {
  const approval = approveCatalogMatch(
    item.searchIdentity,
    item.profileFieldKey ?? "",
    item.catalogMatch?.query ?? item.profileValue ?? "",
  );
  if (approval.status !== "selected") return approval;
  return item.catalogMatch &&
    JSON.stringify(approval.match) === JSON.stringify(item.catalogMatch)
    ? approval
    : { status: "invalid" };
}
