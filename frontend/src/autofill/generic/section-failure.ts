/** Why every field of one section is BLOCKED. */
export const GENERIC_SECTION_FAILURE = {
  CLASSIFY_UNAVAILABLE: "CLASSIFY_UNAVAILABLE",
  ANALYZE_UNAVAILABLE: "ANALYZE_UNAVAILABLE",
  /** HTTP 404 from a backend without the generic endpoints. */
  ENDPOINT_UNAVAILABLE: "ENDPOINT_UNAVAILABLE",
  /** The backend returned the field with reason LLM_UNAVAILABLE. */
  LLM_UNAVAILABLE: "LLM_UNAVAILABLE",
  /** A local exception while preparing or converting this section. */
  SECTION_PROCESSING_FAILED: "SECTION_PROCESSING_FAILED",
} as const;

export type GenericSectionFailure =
  (typeof GENERIC_SECTION_FAILURE)[keyof typeof GENERIC_SECTION_FAILURE];
