import { executionPolicy } from "../workflow/execution-policy";
export type CompanyId = "policy" | "generic" | "components";

export function resolveCompany(_host: string): CompanyId {
  return "generic";
}

export function resolveDocumentCompany(document: Document): CompanyId {
  if (executionPolicy(document)?.browserPolicy) return "policy";
  return executionPolicy(document)?.componentPolicy ? "components" : "generic";
}
