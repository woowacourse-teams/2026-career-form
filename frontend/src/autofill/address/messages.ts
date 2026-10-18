import {
  validAddressProviderPolicy,
  type AddressProviderPolicy,
} from "./provider-policy";
import type { AddressIdentity } from "./match";
export type AddressMessage =
  | {
      type: "SEARCH";
      id: string;
      expected: AddressIdentity;
      policy: AddressProviderPolicy;
    }
  | {
      type: "PROPOSE" | "COMMIT" | "FAILED" | "CANCEL";
      id: string;
    }
  | { type: "SELECTED"; id: string; selected: AddressIdentity };
export function addressMessage(value: unknown): AddressMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id || v.id.length > 100) return;
  if (v.type === "SEARCH") {
    if (
      Object.keys(v).some(
        (k) => !["type", "id", "expected", "policy"].includes(k),
      ) ||
      !v.expected ||
      typeof v.expected !== "object"
    )
      return;
    if (!validAddressProviderPolicy(v.policy)) return;
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
      policy: v.policy,
      id: v.id,
      expected: { address: e.address, postalCode: e.postalCode },
    };
  }
  if (v.type === "SELECTED") {
    const selected = v.selected as Record<string, unknown> | undefined;
    if (
      Object.keys(v).length !== 3 ||
      !selected ||
      typeof selected !== "object" ||
      Object.keys(selected).length !== 2 ||
      typeof selected.address !== "string" ||
      !selected.address.trim() ||
      selected.address.length > 200 ||
      typeof selected.postalCode !== "string" ||
      !/^\d{5}$/.test(selected.postalCode)
    )
      return;
    return {
      type: "SELECTED",
      id: v.id,
      selected: { address: selected.address, postalCode: selected.postalCode },
    };
  }
  if (
    Object.keys(v).length === 2 &&
    ["PROPOSE", "COMMIT", "FAILED", "CANCEL"].includes(String(v.type))
  )
    return v as AddressMessage;
}
