import type { AddressIdentity } from "./match";
export type AddressMessage =
  | { type: "SEARCH"; id: string; expected: AddressIdentity }
  | {
      type: "PROPOSE" | "COMMIT" | "SELECTED" | "FAILED" | "CANCEL";
      id: string;
    };
export function addressMessage(value: unknown): AddressMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id || v.id.length > 100) return;
  if (v.type === "SEARCH") {
    if (
      Object.keys(v).some((k) => !["type", "id", "expected"].includes(k)) ||
      !v.expected ||
      typeof v.expected !== "object"
    )
      return;
    const e = v.expected as Record<string, unknown>;
    if (
      Object.keys(e).length !== 2 ||
      typeof e.address !== "string" ||
      !e.address.trim() ||
      e.address.length > 200 ||
      typeof e.postalCode !== "string" ||
      !/^\d{5}$/.test(e.postalCode)
    )
      return;
    return {
      type: "SEARCH",
      id: v.id,
      expected: { address: e.address, postalCode: e.postalCode },
    };
  }
  if (
    Object.keys(v).length === 2 &&
    ["PROPOSE", "COMMIT", "SELECTED", "FAILED", "CANCEL"].includes(
      String(v.type),
    )
  )
    return v as AddressMessage;
}
