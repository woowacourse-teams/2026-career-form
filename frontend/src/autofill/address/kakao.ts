import { normalizeAddress, selectAddress, type AddressIdentity } from "./match";

export function findKakaoResult(
  document: Document,
  expected: AddressIdentity,
): HTMLButtonElement | undefined {
  const paging = document.querySelectorAll(".paging_post");
  if (
    paging.length !== 1 ||
    !/현재페이지\s*1\s*\/\s*1(?:\s|$)/.test(paging[0].textContent ?? "")
  )
    return undefined;
  const results = Array.from(
    document.querySelectorAll<HTMLElement>("li.list_post_item"),
  ).flatMap((row) => {
    const codes = row.querySelectorAll(".txt_postcode");
    const postalCode = row.dataset.zonecode ?? "";
    if (
      codes.length !== 1 ||
      normalizeAddress(codes[0].textContent ?? "") !== postalCode
    )
      return [];
    return Array.from(
      row.querySelectorAll<HTMLButtonElement>(
        "button.link_post:not(.link_english):not(.link_btn_map)",
      ),
    ).flatMap((button) => {
      const addresses = button.querySelectorAll(".txt_addr");
      if (addresses.length !== 1 || button.disabled) return [];
      return [{ address: addresses[0].textContent ?? "", postalCode, button }];
    });
  });
  return selectAddress(expected, results)?.button;
}
