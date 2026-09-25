import { describe, expect, it } from "vitest";
import { validateCjSchoolRequest } from "./cj-school-contract";

function schoolForm(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<form id="mainForm" name="mainForm" action="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo" method="post" onsubmit="return goSearch();"><input type="hidden" name="num" value="2_0"><div class="container_wrap"><div id="popupBasic4" class="popup popup_college iframe_opened"><div class="popup_inner"><div class="popup_content"><div class="sec_top"><div class="area_schForm"><fieldset><input type="text" class="iText" id="school_name" name="school_name" value="" title="학교명 입력" maxlength="30"><input type="submit" value="검색"></fieldset></div></div></div></div></div></div></form>';
  return doc;
}

describe("CJ school request", () => {
  it("sends only the approved school query and first-row context", () => {
    expect(validateCjSchoolRequest(schoolForm(), "합성대학교", "2_0").toString())
      .toBe("school_name=%ED%95%A9%EC%84%B1%EB%8C%80%ED%95%99%EA%B5%90&num=2_0");
  });
  it("rejects an extra hidden control before transmission", () => {
    const doc = schoolForm();
    doc.querySelector("fieldset")!.insertAdjacentHTML("beforeend", '<input type="hidden" name="private" value="secret">');
    expect(() => validateCjSchoolRequest(doc, "합성대학교", "2_0")).toThrow();
  });
  it("rejects a tampered row context", () => {
    const doc = schoolForm();
    doc.querySelector('input[name="num"]')!.setAttribute("value", "2_1");
    expect(() => validateCjSchoolRequest(doc, "합성대학교", "2_0")).toThrow();
  });
});
