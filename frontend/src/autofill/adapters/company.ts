import { greetingBasicControls } from "./greeting/fingerprint";
import { isHplaceDocument } from "./hplace/fingerprint";
export type CompanyId = "sk" | "hyundai" | "generic" | "greeting" | "hplace";

export function resolveCompany(host: string): CompanyId {
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === "www.skcareers.com") return "sk";
  if (normalizedHost === "talent.hyundai.com") return "hyundai";
  if (
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.career\.greetinghr\.com$/.test(
      normalizedHost,
    )
  )
    return "greeting";
  return "generic";
}

export function isSkCareersHost(host: string): boolean {
  return resolveCompany(host) === "sk";
}

export function isHyundaiTalentHost(host: string): boolean {
  return resolveCompany(host) === "hyundai";
}

const platformDocuments = new WeakMap<
  Document,
  { url: string; host: string; company: "greeting" | "hplace" }
>();

export function resolveDocumentCompany(document: Document): CompanyId {
  const company = resolveCompany(document.location?.host ?? "");
  if (company !== "generic") return company;
  const identity = { url: document.URL, host: document.location?.host ?? "" };
  if (isHplaceDocument(document)) {
    platformDocuments.set(document, { ...identity, company: "hplace" });
    return "hplace";
  }
  const established = platformDocuments.get(document);
  if (established?.url === identity.url && established.host === identity.host)
    return established.company;
  platformDocuments.delete(document);
  const controls = greetingBasicControls(document);
  if (!controls) return "generic";
  const roots = controls.map((input) => {
    if (
      !["text", "tel"].includes(input.type) ||
      input.closest('[data-scope="accordion"], template')
    )
      return null;
    const root = input.closest('[data-scope="field"][data-part="root"]');
    return root && root.querySelector("label") ? root : null;
  });
  if (
    !roots.every(Boolean) ||
    roots[0] === roots[1] ||
    controls[0].form !== controls[1].form
  )
    return "generic";
  platformDocuments.set(document, { ...identity, company: "greeting" });
  return "greeting";
}
