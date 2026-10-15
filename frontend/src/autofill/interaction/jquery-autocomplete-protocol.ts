import type { ApprovedCatalogMatch } from "../profile/catalog-match";

export const JQUERY_AUTOCOMPLETE_REQUEST_EVENT =
  "career-form:jquery-autocomplete-request";
export const JQUERY_AUTOCOMPLETE_RESPONSE_EVENT =
  "career-form:jquery-autocomplete-response";
export const JQUERY_AUTOCOMPLETE_TARGET_ATTRIBUTE =
  "data-career-form-jquery-autocomplete-target";
export type JqueryAutocompleteFieldName = string;
export function matchesCatalogField(
  field: string,
  match: ApprovedCatalogMatch,
  kind?: string,
): boolean {
  return !!field && match.kind === kind;
}
