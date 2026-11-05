import type { CatalogEntry } from "../../../profile/catalog";
import {
  catalogHighSchoolRegion,
  normalizedCatalogLabel,
} from "../../profile/catalog-identity";

/**
 * Region that may break a tie between same-name high-school options. A
 * selected catalog entry uses its own sido and refuses a contradicting profile
 * region; otherwise the profile's standard region label is used.
 */
export function expectedSearchRegion(
  kind: string | undefined,
  catalog: CatalogEntry | undefined,
  profileRegion: string | undefined,
): string | undefined {
  if (kind !== "highSchool") return undefined;
  if (!catalog) return profileRegion || undefined;
  const own = catalogHighSchoolRegion(catalog);
  return own &&
    (!profileRegion ||
      normalizedCatalogLabel(profileRegion) === normalizedCatalogLabel(own))
    ? own
    : undefined;
}

/**
 * The one candidate whose visible description equals the expected region, or
 * null. Every candidate must expose exactly one readable, non-empty
 * description; anything hidden, missing or repeated keeps the tie unresolved.
 */
export function regionTieBreak<T>(
  candidates: readonly T[],
  region: string | undefined,
  describe: (candidate: T) => string | undefined,
  accept: (candidate: T, description: string) => boolean = () => true,
): T | null {
  if (!region) return null;
  const described = candidates.map((candidate) => ({
    candidate,
    description: describe(candidate),
  }));
  if (described.some(({ description }) => !description)) return null;
  const matches = described.filter(
    ({ description }) =>
      normalizedCatalogLabel(description!) === normalizedCatalogLabel(region),
  );
  return matches.length === 1 &&
    accept(matches[0].candidate, matches[0].description!)
    ? matches[0].candidate
    : null;
}
