import { beforeEach, describe, expect, it } from "vitest";
import { findKakaoResult as findPolicyResult } from "./kakao";
import providerData from "../../../../backend/src/main/resources/policies/address-provider-v1.json";
import type { AddressProviderPolicy } from "./provider-policy";
const findKakaoResult = (
  doc: Document,
  expected: { address: string; postalCode: string },
) => findPolicyResult(doc, expected, providerData as AddressProviderPolicy);
const expected = {
  address: "제주특별자치도 제주시 첨단로 242",
  postalCode: "63309",
};
function row(postalCode = "63309") {
  return `<li class="list_post_item" data-zonecode="${postalCode}">
 <span class="txt_postcode">${postalCode}</span><dl><dd>
 <button class="link_post"><span class="txt_addr">제주특별자치도 제주시 첨단로 242</span><span class="txt_addr_eng">English address</span></button>
 </dd><dd><button class="link_post"><span class="txt_addr">제주특별자치도 제주시 영평동 2181</span></button></dd></dl>
 <button class="link_post link_english">영문보기</button></li>`;
}
describe("policy-driven first Kakao result", () => {
  beforeEach(() => {
    document.body.innerHTML = `<ul>${row()}</ul><div class="paging_post">현재페이지1 / 1</div>`;
  });
  it("chooses the first road button, not the lot-number or English button", () => {
    expect(findKakaoResult(document, expected)).toBe(document.querySelector("button.link_post"));
  });
  it("keeps the first result when later rows match too", () => {
    document.querySelector("ul")!.insertAdjacentHTML("beforeend", row());
    expect(findKakaoResult(document, expected)).toBe(document.querySelector("button.link_post"));
  });
  it("rejects inconsistent postcode metadata", () => {
    document.querySelector(".txt_postcode")!.textContent = "00000";
    expect(findKakaoResult(document, expected)).toBeUndefined();
  });
  it.each(["다른 주소", expected.address + " (101호)", expected.address + "-1"])("does not use profile text as a selection filter: %s", address => {
    expect(findKakaoResult(document, {...expected, address, postalCode: "00000"})).toBe(document.querySelector("button.link_post"));
  });
  it("rejects a disabled first result without choosing a later button", () => {
    document.querySelector<HTMLButtonElement>("button.link_post")!.disabled = true;
    expect(findKakaoResult(document, expected)).toBeUndefined();
  });
  it("does not choose results from a later page", () => {
    document.querySelector(".paging_post")!.textContent = "현재페이지2 / 2";
    expect(findKakaoResult(document, expected)).toBeUndefined();
  });
});
