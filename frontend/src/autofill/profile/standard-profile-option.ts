import {
  DISABILITY_STATUS_OPTIONS,
  MILITARY_BRANCH_OPTIONS,
  MILITARY_RANK_OPTIONS,
  MILITARY_STATUS_OPTIONS,
  VETERAN_STATUS_OPTIONS,
  type StandardValueOption,
} from "../../profile/standard-values";

const PROFILE_OPTIONS: Readonly<
  Record<string, readonly StandardValueOption[]>
> = {
  "military.military.militaryStatus": MILITARY_STATUS_OPTIONS,
  "military.military.militaryBranch": MILITARY_BRANCH_OPTIONS,
  "military.military.militaryRank": MILITARY_RANK_OPTIONS,
  "veteran.veteran.veteranStatus": VETERAN_STATUS_OPTIONS,
  "disability.disability.disabilityStatus": DISABILITY_STATUS_OPTIONS,
};

const normalized = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

/** Local interpretation only. Never modifies stored profile strings. */
export function normalizeProfileOptionValue(
  profileFieldKey: string,
  value: string,
): string {
  const options = PROFILE_OPTIONS[profileFieldKey];
  if (!options) return value;
  const source = normalized(value);
  if (!source) return "";
  const matches = options.filter((option) =>
    [option.value, option.label, ...(option.aliases ?? [])].some(
      (alias) => normalized(alias) === source,
    ),
  );
  return matches.length === 1 ? matches[0].label : "";
}
