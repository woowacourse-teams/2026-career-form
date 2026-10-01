import { beforeEach, describe, expect, it } from "vitest";
import { findKakaoResult } from "./kakao";
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
describe("Kakao postcode result DOM", () => {
  beforeEach(() => {
    document.body.innerHTML = `<ul>${row()}</ul><div class="paging_post">현재페이지1 / 1</div>`;
  });
  it("returns the Korean address button rather than concatenated English or map controls", () => {
    expect(
      findKakaoResult(document, expected)?.querySelector(".txt_addr")
        ?.textContent,
    ).toBe(expected.address);
  });
  it("rejects duplicate matching rows and partial pagination", () => {
    document.querySelector("ul")!.insertAdjacentHTML("beforeend", row());
    expect(findKakaoResult(document, expected)).toBeUndefined();
    document.querySelector("ul")!.innerHTML = row();
    document.querySelector(".paging_post")!.textContent = "현재페이지1 / 2";
    expect(findKakaoResult(document, expected)).toBeUndefined();
  });
  it("rejects inconsistent postcode metadata, stale address text and wrong postal code", () => {
    document.querySelector(".txt_postcode")!.textContent = "00000";
    expect(findKakaoResult(document, expected)).toBeUndefined();
    document.querySelector("ul")!.innerHTML = row("00000");
    expect(findKakaoResult(document, expected)).toBeUndefined();
    document.querySelector("ul")!.innerHTML = row();
    document.querySelector(".txt_addr")!.textContent += "-1";
    expect(findKakaoResult(document, expected)).toBeUndefined();
  });
});

describe("Kakao verified legal-dong reference", () => {
  const withReference = {
    ...expected,
    address: expected.address + " (영평동)",
  };
  beforeEach(() => {
    document.body.innerHTML = `<ul>${row()}</ul><div class="paging_post">현재페이지1 / 1</div>`;
    document.querySelector<HTMLElement>("li")!.dataset.bname = "영평동";
  });
  it("selects the unique road result when its legal-dong metadata proves the reference", () => {
    expect(findKakaoResult(document, withReference)).toBe(
      document.querySelector("button.link_post"),
    );
  });
  it.each(["다른동", "", "영평동, 101호"])(
    "rejects unverified legal-dong metadata %s",
    (bname) => {
      document.querySelector<HTMLElement>("li")!.dataset.bname = bname;
      expect(findKakaoResult(document, withReference)).toBeUndefined();
    },
  );
  it("does not discard a unit number, building number, or duplicate identity", () => {
    expect(
      findKakaoResult(document, {
        ...expected,
        address: expected.address + " (101호)",
      }),
    ).toBeUndefined();
    expect(
      findKakaoResult(document, {
        ...expected,
        address: expected.address + "-1 (영평동)",
      }),
    ).toBeUndefined();
    const copy = document.querySelector("li")!.cloneNode(true);
    document.querySelector("ul")!.append(copy);
    expect(findKakaoResult(document, withReference)).toBeUndefined();
  });
});
