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
  const matches = results.filter(
    (result) =>
      result.postalCode === expected.postalCode &&
      normalizeAddress(result.address) === normalizeAddress(expected.address),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
