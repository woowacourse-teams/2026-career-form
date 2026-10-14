import type { AddressProviderPolicy } from "./provider-policy";
import {
  firstAddressResult,
  normalizeAddress,
  type AddressIdentity,
} from "./match";

export function kakaoResultIdentity(
  button: HTMLButtonElement,
  policy: AddressProviderPolicy,
): AddressIdentity | undefined {
  const row = button.closest<HTMLElement>(policy.selectors.row);
  const codes = row?.querySelectorAll(policy.selectors.code);
  const addresses = button.querySelectorAll(policy.selectors.address);
  const postalCode = row?.getAttribute(policy.postalAttribute) ?? "";
  if (
    codes?.length !== 1 ||
    addresses.length !== 1 ||
    button.disabled ||
    normalizeAddress(codes[0].textContent ?? "") !== postalCode
  )
    return undefined;
  return firstAddressResult([
    { address: normalizeAddress(addresses[0].textContent ?? ""), postalCode },
  ]);
}

export function findKakaoResult(
  document: Document,
  _expected: AddressIdentity,
  policy: AddressProviderPolicy,
): HTMLButtonElement | undefined {
  const paging = document.querySelectorAll(policy.selectors.paging);
  if (
    paging.length !== 1 ||
    !new RegExp(policy.firstPagePattern).test(paging[0].textContent ?? "")
  )
    return undefined;
  const row = document.querySelector<HTMLElement>(policy.selectors.row);
  const button = row?.querySelector<HTMLButtonElement>(policy.selectors.result);
  return button &&
    policy.resultStrategy === "FIRST_RESULT" &&
    kakaoResultIdentity(button, policy)
    ? button
    : undefined;
}
