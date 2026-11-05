import { normalizeStagedRoad } from "../policy/staged-address-road";
import {
  addressWithoutRoadReference,
  normalizeAddress,
  type AddressIdentity,
} from "./match";

function comparableRoad(address: string): string {
  return normalizeStagedRoad(addressWithoutRoadReference(address));
}

/**
 * Postal code plus road address without its reference. Vendor searches shorten
 * the province ("서울") that the standard address spells out ("서울특별시"), so
 * only that finite alias is folded. A dialog that takes the detail line may
 * append `appendedDetail` to the address it writes.
 */
export function writtenAddressMatchesProfile(
  written: AddressIdentity,
  profile: AddressIdentity,
  appendedDetail?: string,
): boolean {
  const detail = normalizeAddress(appendedDetail ?? "");
  const address = normalizeAddress(written.address);
  const road =
    detail && address.endsWith(` ${detail}`)
      ? address.slice(0, -detail.length - 1)
      : address;
  return (
    road.length > 0 &&
    written.postalCode === profile.postalCode &&
    comparableRoad(road) === comparableRoad(profile.address)
  );
}
