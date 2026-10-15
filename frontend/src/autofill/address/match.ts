export interface AddressIdentity {
  address: string;
  postalCode: string;
}
export function normalizeAddress(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
export function selectAddress<T extends AddressIdentity>(
  expected: AddressIdentity,
  results: readonly T[],
): T | undefined {
  if (
    !normalizeAddress(expected.address) ||
    !/^\d{5}$/.test(expected.postalCode)
  )
    return undefined;
  return firstAddressResult(results);
}

/** Results must be supplied in the search UI's display order. Never skip a malformed first row. */
export function firstAddressResult<
  T extends { address?: string; postalCode?: string },
>(results: readonly T[]): T | undefined {
  const first = results[0];
  return first?.address &&
    normalizeAddress(first.address) &&
    /^\d{5}$/.test(first.postalCode ?? "")
    ? first
    : undefined;
}

/** Ignore trailing reference text only after a complete road name/building number. */
export function addressWithoutRoadReference(value: string): string {
  const normalized = normalizeAddress(value);
  const match = /^(.+[로길]\s+\d+(?:-\d+)?)\s*(?:\([^()]*\)\s*)+$/.exec(normalized);
  return match ? match[1].trim() : normalized;
}

export function matchesAddressText(
  actual: string,
  selected: string,
  mode?: "POSTAL_AND_ROAD_WITHOUT_REFERENCE",
): boolean {
  const normalize = mode === "POSTAL_AND_ROAD_WITHOUT_REFERENCE"
    ? addressWithoutRoadReference : normalizeAddress;
  const expected = normalize(selected);
  return expected.length > 0 && normalize(actual) === expected;
}
