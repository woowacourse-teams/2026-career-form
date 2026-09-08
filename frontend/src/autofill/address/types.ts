import type { AddressIdentity } from "./match";
export interface AddressValue extends AddressIdentity {
  detail: string;
}
// true certifies a unique postcode/address match, including provider-verified
// legal-dong reference metadata when the displayed road address omits it.
export type AddressSearch = (
  expected: AddressIdentity,
  maySelect: () => Promise<boolean>,
  signal: AbortSignal,
) => Promise<boolean>;
export interface AddressExecutionOptions {
  document: Document;
  button: Element;
  expected: AddressValue;
  loadCurrent: () => Promise<AddressValue>;
  signal: AbortSignal;
  search: AddressSearch;
}
export interface AddressResult {
  status: "written" | "manual";
  reason: string;
}
