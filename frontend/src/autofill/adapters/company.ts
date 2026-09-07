export type CompanyId = "sk" | "hyundai" | "generic";

export function resolveCompany(host: string): CompanyId {
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === "www.skcareers.com") return "sk";
  if (normalizedHost === "talent.hyundai.com") return "hyundai";
  return "generic";
}

export function isSkCareersHost(host: string): boolean {
  return resolveCompany(host) === "sk";
}

export function isHyundaiTalentHost(host: string): boolean {
  return resolveCompany(host) === "hyundai";
}
