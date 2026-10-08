import type { ProfileIdentity } from "./model";

export function isProfileIdentity(value: unknown): value is ProfileIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("originalText" in value) || typeof value.originalText !== "string") {
    return false;
  }
  if (!("status" in value)) return false;
  switch (value.status) {
    case "manual":
      return true;
    case "selected":
      return (
        "catalogId" in value &&
        typeof value.catalogId === "string" &&
        value.catalogId.trim().length > 0 &&
        "displayName" in value &&
        typeof value.displayName === "string" &&
        value.displayName.trim().length > 0 &&
        "catalogVersion" in value &&
        typeof value.catalogVersion === "string" &&
        value.catalogVersion.trim().length > 0
      );
    default:
      return false;
  }
}
