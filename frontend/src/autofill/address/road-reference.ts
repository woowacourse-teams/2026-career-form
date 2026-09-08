import { normalizeAddress } from "./match";

// Only the legal-dong reference attached to a complete road/building address.
// Apartment names, unit numbers and arbitrary parenthetical text are not aliases.
export function splitRoadReference(
  address: string,
): { road: string; dong: string } | undefined {
  const match = /^(.*[로길] \d+(?:-\d+)?) \(([가-힣0-9·]+동)\)$/.exec(
    normalizeAddress(address),
  );
  return match ? { road: match[1], dong: match[2] } : undefined;
}

export function matchesRoadReference(
  expected: string,
  road: string,
  legalDong: string,
): boolean {
  const reference = splitRoadReference(expected);
  return (
    !!reference &&
    reference.road === normalizeAddress(road) &&
    reference.dong === normalizeAddress(legalDong)
  );
}
