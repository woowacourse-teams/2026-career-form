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
export function catalogHighSchoolRegion(
  entry: CatalogEntry,
): string | undefined {
  if (entry.kind !== "highSchool") return undefined;
  const region = entry.detail.split(" · ")[0]?.trim();
  return region || undefined;
}

/**
 * Component forms high-school options expose only the sido abbreviation. Accept it only
 * when name and sido together identify exactly this catalog entry.
 */
export function matchesCatalogHighSchoolRegion(
  entry: CatalogEntry,
  label: string,
  region: string,
): boolean {
  const own = catalogHighSchoolRegion(entry);
  if (!own || normalizedCatalogLabel(region) !== normalizedCatalogLabel(own))
    return false;
  const candidates = [
    ...(labelEntries.get(`${entry.kind}:${normalizedCatalogLabel(label)}`) ??
      []),
  ].filter((candidate) => catalogHighSchoolRegion(candidate) === own);
  return candidates.length === 1 && candidates[0].id === entry.id;
}

/** KESS school code shared by every campus record of one institution. */
function kessSchoolCode(entry: CatalogEntry): string | undefined {
  const [kind, source, code] = entry.id.split(":");
  return kind === entry.kind && source === "kess" && code ? code : undefined;
}

/**
 * Component forms university options name the institution without campus text. Accept
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

const POLYTECH = "한국폴리텍대학";
const POLYTECH_NUMBER = /^한국폴리텍([ivx]+)대학/;

/** Normalized Korea Polytechnic label without its college number ("I", "Ⅶ"). */
function polytechKey(label: string): { key: string; number?: string } {
  const normalized = normalizedCatalogLabel(label);
  const number = POLYTECH_NUMBER.exec(normalized)?.[1];
  return {
    key: normalized.replace(POLYTECH_NUMBER, POLYTECH),
    ...(number ? { number } : {}),
  };
}

const polytechEntries = new Map<string, Set<CatalogEntry>>();
for (const entry of CATALOG) {
  if (entry.kind !== "university" && entry.kind !== "graduateSchool") continue;
  for (const label of catalogLabels(entry)) {
    const { key } = polytechKey(label);
    if (!key.startsWith(POLYTECH)) continue;
    const entries = polytechEntries.get(`${entry.kind}:${key}`) ?? new Set();
    polytechEntries.set(`${entry.kind}:${key}`, entries.add(entry));
  }
}

/**
 * KESS names some Korea Polytechnic campuses without the college number that
 * sites list ("한국폴리텍 I 대학 서울정수캠퍼스"). Accept a label that differs
 * only by a number present on exactly one side, and only when the numberless
 * key identifies exactly this catalog entry.
 */
export function matchesCatalogNumberedCollege(
  entry: CatalogEntry,
  label: string,
): boolean {
  if (entry.kind !== "university" && entry.kind !== "graduateSchool")
    return false;
  const site = polytechKey(label);
  if (!site.key.startsWith(POLYTECH)) return false;
  const candidates = [
    ...(polytechEntries.get(`${entry.kind}:${site.key}`) ?? []),
  ];
  return (
    candidates.length === 1 &&
    candidates[0].id === entry.id &&
    catalogLabels(entry).some((name) => {
      const own = polytechKey(name);
      return own.key === site.key && !own.number !== !site.number;
    })
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
