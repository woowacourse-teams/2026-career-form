// Autofill uses saved profile values without a separate sensitive-value approval.
// Sensitivity metadata remains available for masking outside autofill.
export function requiresSensitiveConfirmation(
  _profileFieldKey: string | undefined,
  _sensitive: boolean,
): boolean {
  return false;
}
