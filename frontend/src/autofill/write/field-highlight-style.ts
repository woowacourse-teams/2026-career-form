export const FIELD_HIGHLIGHT = {
  background: "#fff1d8",
  border: "2px solid #ad5b2f",
} as const;
/** Fields the autofill left empty: a border only, never a site-side style. */
export const UNFILLED_FIELD_HIGHLIGHT = {
  background: "transparent",
  border: "2px solid #d70015",
} as const;
