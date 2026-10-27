import type { AddressIdentity } from "./match";
export interface AddressValue extends AddressIdentity {
  detail: string;
}
// Reports the first selected result so callers verify the site callback against it.
export type AddressSearch = (
  expected: AddressIdentity,
  maySelect: () => Promise<boolean>,
  signal: AbortSignal,
  onSelected?: (selected: AddressIdentity) => void,
) => Promise<boolean>;
/** Generic pages without an address policy pass the resolved controls themselves. */
export interface GenericAddressTargets {
  postalCode?: HTMLInputElement;
  address: HTMLInputElement;
  /** Absent when the form has no detail-address field at all. */
  detail?: HTMLInputElement;
}
export interface AddressExecutionOptions {
  document: Document;
  button: Element;
  expected: AddressValue;
  loadCurrent: () => Promise<AddressValue>;
  signal: AbortSignal;
  search: AddressSearch;
  targets?: GenericAddressTargets;
}
export interface AddressResult {
  status: "written" | "manual";
  reason: string;
}
