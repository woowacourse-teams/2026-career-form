import { nativeDocument } from "../policy/native-form-collection";
import {
  nativePolicyRequired,
  executionPolicy,
} from "../workflow/execution-policy";
import { detailControls } from "./hplace/detail";
import { isHplaceDocument } from "./hplace/fingerprint";
import { registrationControls } from "./hplace/registration";

export type CompanyId = "policy" | "generic" | "components" | "hplace";

export function resolveCompany(_host: string): CompanyId {
  return "generic";
}

export function isUnsupportedHplace(document: Document): boolean {
  if (nativePolicyRequired(document))
    return (
      !nativeDocument(document) &&
      !registrationControls(document) &&
      !detailControls(document)
    );
  return (
    resolveDocumentCompany(document) === "hplace" &&
    !registrationControls(document) &&
    !detailControls(document)
  );
}

const hplaceDocuments = new WeakMap<Document, { url: string; host: string }>();

export function resolveDocumentCompany(document: Document): CompanyId {
  if (executionPolicy(document)?.browserPolicy) return "policy";
  if (executionPolicy(document)?.componentPolicy) return "components";
  if (nativePolicyRequired(document)) return "hplace";
  const identity = { url: document.URL, host: document.location?.host ?? "" };
  if (isHplaceDocument(document)) {
    hplaceDocuments.set(document, identity);
    return "hplace";
  }
  const established = hplaceDocuments.get(document);
  if (established?.url === identity.url && established.host === identity.host)
    return "hplace";
  hplaceDocuments.delete(document);
  return "generic";
}
