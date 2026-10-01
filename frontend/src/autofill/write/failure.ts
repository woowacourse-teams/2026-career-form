// Diagnostic codes only: never include profile values or site error text.
export type WriteFailureCode =
  | "SEARCH_NO_RESULTS"
  | "SEARCH_NO_EXACT_MATCH"
  | "SEARCH_AMBIGUOUS"
  | "SEARCH_TIMEOUT"
  | "SEARCH_UNCONFIRMED"
  | "SEARCH_FORM_UNVERIFIED"
  | "SEARCH_NAVIGATION_UNSAFE"
  | "SEARCH_RESULTS_INCOMPLETE"
  | "SEARCH_ACTIVATION_UNSAFE"
  | "SEARCH_FOLLOWUP_HALTED"
  | "EXAM_SCORE_NOT_READY"
  | "ROW_SEARCH_UNCONFIRMED"
  | "FIELD_DISABLED"
  | "FIELD_READONLY"
  | "FIELD_CHANGED"
  | "VALUE_NOT_RETAINED";

export type FailureReporter = (code: WriteFailureCode) => void;
