import { validDomPlan, type DomPlan } from "../policy/action-plan";
export interface AddressProviderPolicy {
  resultStrategy: "FIRST_RESULT";
  selectors: {
    input: string;
    query: string;
    trigger: string;
    row: string;
    code: string;
    address: string;
    result: string;
    paging: string;
  };
  postalAttribute: string;
  firstPagePattern: string;
  searchPlan: DomPlan;
  searchMs: number;
  commitMs: number;
  pollMs: number;
}
export function validAddressProviderPolicy(
  value: unknown,
): value is AddressProviderPolicy {
  const p = value as AddressProviderPolicy;
  if (
    !p ||
    typeof p !== "object" ||
    p.resultStrategy !== "FIRST_RESULT" ||
    !p.selectors ||
    typeof p.postalAttribute !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(p.postalAttribute) ||
    typeof p.firstPagePattern !== "string" ||
    p.firstPagePattern.length > 1000 ||
    !validDomPlan(p.searchPlan) ||
    ![p.searchMs, p.commitMs, p.pollMs].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 15000,
    )
  )
    return false;
  try {
    new RegExp(p.firstPagePattern);
    return [
      "input",
      "query",
      "trigger",
      "row",
      "code",
      "address",
      "result",
      "paging",
    ].every((key) => {
      const selector = p.selectors[key as keyof typeof p.selectors];
      if (typeof selector !== "string" || !selector || selector.length > 1000)
        return false;
      if (typeof document !== "undefined")
        document.createDocumentFragment().querySelector(selector);
      return true;
    });
  } catch {
    return false;
  }
}
