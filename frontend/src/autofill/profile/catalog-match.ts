import type { CatalogKind } from "../../profile/catalog-search";

export interface ApprovedCatalogMatch {
  readonly kind: CatalogKind;
  readonly query: string;
  readonly labels: readonly string[];
  readonly requiredDetail?: string;
}

export interface CatalogEvidence {
  readonly label: string;
  readonly detail?: string;
}

export type CatalogApproval =
  | { readonly status: "legacy" }
  | { readonly status: "invalid" }
  | { readonly status: "selected"; readonly match: ApprovedCatalogMatch };

export function normalizedCatalogLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("en-US");
}

function boundedText(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit
  );
}

/** The MAIN-world bridge accepts one bounded, approved entry, never a catalog. */
export function isApprovedCatalogMatch(
  value: unknown,
): value is ApprovedCatalogMatch {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    typeof value.kind !== "string" ||
    ![
      "certificate",
      "languageTest",
      "highSchool",
      "university",
      "graduateSchool",
    ].includes(value.kind) ||
    !("query" in value) ||
    !boundedText(value.query, 512) ||
    !("labels" in value) ||
    !Array.isArray(value.labels) ||
    value.labels.length < 1 ||
    value.labels.length > 64 ||
    !value.labels.every((label: unknown) => boundedText(label, 512))
  )
    return false;
  const school =
    value.kind === "highSchool" ||
    value.kind === "university" ||
    value.kind === "graduateSchool";
  return school
    ? "requiredDetail" in value && boundedText(value.requiredDetail, 2048)
    : !("requiredDetail" in value);
}

export function matchesApprovedCatalog(
  match: ApprovedCatalogMatch,
  evidence: CatalogEvidence,
): boolean {
  return (
    match.labels.some(
      (label) =>
        normalizedCatalogLabel(label) ===
        normalizedCatalogLabel(evidence.label),
    ) &&
    (match.requiredDetail === undefined ||
      (evidence.detail !== undefined &&
        normalizedCatalogLabel(evidence.detail) ===
          normalizedCatalogLabel(match.requiredDetail)))
  );
}
