import { browser } from "wxt/browser";
import type { StructuredAddress } from "./address";

export type { StructuredAddress } from "./address";

export const ADDRESS_SEARCH_MESSAGE = "careerForm.profile.addressSearch";

export type AddressSearchErrorCode =
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "NETWORK";

export interface AddressSearchPage {
  addresses: StructuredAddress[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export type AddressSearchResult =
  | ({ ok: true } & AddressSearchPage)
  | { ok: false; code: AddressSearchErrorCode };

const ERROR_CODES: readonly unknown[] = [
  "INVALID_INPUT",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "NETWORK",
] satisfies AddressSearchErrorCode[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAddress(value: unknown): value is StructuredAddress {
  return (
    isRecord(value) &&
    typeof value.postalCode === "string" &&
    /^\d{5}$/.test(value.postalCode) &&
    typeof value.roadAddress === "string" &&
    value.roadAddress.trim().length > 0 &&
    typeof value.jibunAddress === "string" &&
    typeof value.buildingManagementNumber === "string"
  );
}

export function isAddressSearchPage(
  value: unknown,
): value is AddressSearchPage {
  return (
    isRecord(value) &&
    Array.isArray(value.addresses) &&
    value.addresses.every(isAddress) &&
    Number.isInteger(value.page) &&
    Number.isInteger(value.pageSize) &&
    Number.isInteger(value.totalCount)
  );
}

function isResult(value: unknown): value is AddressSearchResult {
  if (!isRecord(value)) return false;
  return value.ok === true
    ? isAddressSearchPage(value)
    : value.ok === false && ERROR_CODES.includes(value.code);
}

/** The query is personal data: it only travels in this message, and failures carry fixed codes. */
export async function searchAddress(
  query: string,
  page: number,
  send: (message: unknown) => Promise<unknown> = (message) =>
    browser.runtime.sendMessage(message),
): Promise<AddressSearchResult> {
  let reply: unknown;
  try {
    reply = await send({ type: ADDRESS_SEARCH_MESSAGE, query, page });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  return isResult(reply) ? reply : { ok: false, code: "UNAVAILABLE" };
}
