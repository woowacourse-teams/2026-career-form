import type { FieldValues } from "./model";

export interface StructuredAddress {
  postalCode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingManagementNumber: string;
}

export type AddressVerification = "empty" | "unverified" | "verified";

/** Fills the standard fields from a search result; the detail line stays the user's. */
export function contactWithSelectedAddress(
  contact: FieldValues,
  address: StructuredAddress,
): FieldValues {
  return {
    ...contact,
    postalCode: address.postalCode,
    addressLine1: address.roadAddress,
    jibunAddress: address.jibunAddress,
    buildingManagementNumber: address.buildingManagementNumber,
    addressVerified: "true",
  };
}

/** A selection describes one postal code and road address; any other value ends it. */
export function withoutStaleAddressVerification(
  previous: FieldValues,
  next: FieldValues,
): FieldValues {
  if (
    (previous.postalCode ?? "") === (next.postalCode ?? "") &&
    (previous.addressLine1 ?? "") === (next.addressLine1 ?? "")
  )
    return next;
  const {
    jibunAddress: _jibunAddress,
    buildingManagementNumber: _buildingManagementNumber,
    addressVerified: _addressVerified,
    ...rest
  } = next;
  return rest;
}

export function addressVerification(contact: FieldValues): AddressVerification {
  if (!contact.postalCode && !contact.addressLine1 && !contact.addressLine2)
    return "empty";
  return contact.addressVerified === "true" &&
    contact.postalCode &&
    contact.addressLine1
    ? "verified"
    : "unverified";
}
