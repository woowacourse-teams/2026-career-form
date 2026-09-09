import type { OptionCandidate } from "../api/types";
import {
  isStandardValueId,
  standardValueAliases,
} from "../../profile/standard-values";
import { normalizeDisplayName } from "../write/display-name";

export type StandardOptionMatch =
  | { status: "unique"; option: OptionCandidate }
  | { status: "none" }
  | { status: "ambiguous"; options: readonly OptionCandidate[] }
  | { status: "not-standard" };

export function matchStandardOption(
  value: string,
  options: readonly OptionCandidate[],
): StandardOptionMatch {
  if (!isStandardValueId(value)) return { status: "not-standard" };
  const aliases = new Set(
    standardValueAliases(value).map(normalizeDisplayName),
  );
  const matches = options.filter((option) =>
    aliases.has(normalizeDisplayName(option.displayName)),
  );
  if (matches.length === 1) return { status: "unique", option: matches[0] };
  if (matches.length === 0) return { status: "none" };
  return { status: "ambiguous", options: matches };
}
