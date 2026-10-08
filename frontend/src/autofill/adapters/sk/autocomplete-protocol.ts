import type { ApprovedCatalogMatch } from "../../profile/catalog-match";

export const SK_AUTOCOMPLETE_REQUEST_EVENT =
  "career-form:sk-autocomplete-request";
export const SK_AUTOCOMPLETE_RESPONSE_EVENT =
  "career-form:sk-autocomplete-response";
export const SK_AUTOCOMPLETE_TARGET_ATTRIBUTE =
  "data-career-form-sk-autocomplete-target";
export type SkAutocompleteFieldName =
  "eduEducationName" | "cerCertName" | "lngExamName";

export function matchesSkCatalogField(
  field: SkAutocompleteFieldName,
  match: ApprovedCatalogMatch,
): boolean {
  return (
    match.kind ===
    (field === "eduEducationName"
      ? "university"
      : field === "cerCertName"
        ? "certificate"
        : "languageTest")
  );
}
