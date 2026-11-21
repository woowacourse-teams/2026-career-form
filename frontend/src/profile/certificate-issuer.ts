/** Profile field key of a certificate's issuer. */
export const CERTIFICATE_ISSUER_KEY = "certifications.certificate.issuer";

const LEGAL_ENTITY_MARKERS = /\(사\)|\(재\)|\(주\)|사단법인|재단법인|주식회사/g;

/**
 * The issuer name without legal-entity markers. Characters stay as written
 * (the name is shown to users); only the spaces the markers leave around the
 * separators are removed.
 */
export function canonicalIssuerName(name: string): string {
  return name
    .replace(LEGAL_ENTITY_MARKERS, " ")
    .replace(/\s*([\u00b7\u318d/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spaces, punctuation and case never tell two spellings of a body apart. */
export function issuerComparisonKey(name: string): string {
  return canonicalIssuerName(name.normalize("NFKC"))
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

/** Official abbreviations and short names of a body; only verified ones. */
const OFFICIAL_ALIAS_GROUPS: readonly ReadonlySet<string>[] = [
  ["한국산업인력공단", "HRDK", "산업인력공단"],
  ["대한상공회의소", "KCCI", "상공회의소"],
  ["한국데이터산업진흥원", "K-DATA", "데이터산업진흥원"],
  ["한국생산성본부", "KPC"],
  ["한국금융연수원", "KBI"],
  ["한국정보통신자격협회", "ICQA"],
  ["한국정보통신진흥협회", "KAIT"],
].map((names) => new Set(names.map(issuerComparisonKey)));

/** Whether two issuer spellings name the same body. An empty name matches nothing. */
export function sameIssuer(left: string, right: string): boolean {
  const a = issuerComparisonKey(left);
  const b = issuerComparisonKey(right);
  if (!a || !b) return false;
  return (
    a === b ||
    OFFICIAL_ALIAS_GROUPS.some((group) => group.has(a) && group.has(b))
  );
}
