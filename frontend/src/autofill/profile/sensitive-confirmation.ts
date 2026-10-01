// These existing saved application fields use ordinary one-click autofill.
// Keep sensitivity metadata for masking outside autofill. New fields must opt in.
const automaticProfileFields = new Set([
  "military.military.militaryStatus",
  "military.military.militaryType",
  "military.military.militaryBranch",
  "military.military.militarySpecialty",
  "military.military.militaryRank",
  "military.military.serviceStartDate",
  "military.military.serviceEndDate",
  "military.military.dischargeType",
  "military.military.exemptionReason",
  "veteran.veteran.veteranStatus",
  "veteran.veteran.veteranType",
  "veteran.veteran.veteranRelation",
  "veteran.veteran.veteranNumber",
  "disability.disability.disabilityStatus",
  "disability.disability.disabilityType",
  "disability.disability.disabilityGrade",
  "disability.disability.disabilityRegistrationNumber",
  "disability.disability.disabilityRegistrationDate",
]);

export function requiresSensitiveConfirmation(
  profileFieldKey: string | undefined,
  sensitive: boolean,
): boolean {
  return sensitive && !automaticProfileFields.has(profileFieldKey ?? "");
}
