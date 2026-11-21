import {
  DISABILITY_GRADE_OPTIONS,
  DISABILITY_STATUS_OPTIONS,
  LANGUAGE_GRADE_OPTIONS,
  MILITARY_BRANCH_OPTIONS,
  MILITARY_RANK_OPTIONS,
  MILITARY_STATUS_OPTIONS,
  VETERAN_STATUS_OPTIONS,
  SCHOOL_REGION_OPTIONS,
  VETERAN_RELATION_OPTIONS,
  isStandardValueId,
  standardValueAliases,
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
  "disability.disability.disabilityGrade": DISABILITY_GRADE_OPTIONS,
  "veteran.veteran.veteranRelation": VETERAN_RELATION_OPTIONS,
  "education.highSchool.schoolRegion": SCHOOL_REGION_OPTIONS,
  "education.university.schoolRegion": SCHOOL_REGION_OPTIONS,
  "education.graduateSchool.schoolRegion": SCHOOL_REGION_OPTIONS,
  "languages.languageTest.grade": LANGUAGE_GRADE_OPTIONS,
};

/** Fields that were free text before; their old text is still a value. */
const LEGACY_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "disability.disability.disabilityGrade",
  "veteran.veteran.veteranRelation",
  "languages.languageTest.grade",
]);

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
    [option.value, ...standardValueAliases(option.value)].some(
      (alias) => normalized(alias) === source,
    ),
  );
  if (matches.length === 1) return matches[0].label;
  // Free text saved before a field became a choice stays as written (자녀, 가족),
  // so adapters that read the text keep working.
  return LEGACY_TEXT_FIELDS.has(profileFieldKey) && !isStandardValueId(value)
    ? value.trim()
    : "";
}
