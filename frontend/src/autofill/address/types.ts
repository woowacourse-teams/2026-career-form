import type { AddressIdentity } from "./match";
export interface AddressValue extends AddressIdentity {
  detail: string;
}
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
