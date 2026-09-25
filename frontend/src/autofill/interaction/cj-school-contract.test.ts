import { describe, expect, it } from "vitest";
import { validateCjSchoolRequest, validateCjSchoolRow, isCjSchoolTarget, writeCjSchoolBundle } from "./cj-school-contract";
import type { TargetIdentity } from "./readonly-search";
import { JSDOM } from "jsdom";

function schoolForm(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<form id="mainForm" name="mainForm" action="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo" method="post" onsubmit="return goSearch();"><input type="hidden" name="num" value="2_0"><div class="container_wrap"><div id="popupBasic4" class="popup popup_college iframe_opened"><div class="popup_inner"><div class="popup_content"><div class="sec_top"><div class="area_schForm"><fieldset><input type="text" class="iText" id="school_name" name="school_name" value="" title="학교명 입력" maxlength="30"><input type="submit" value="검색"></fieldset></div></div></div></div></div></div></form>';
  return doc;
}

function row(region = "") {
  const doc = new JSDOM('<!doctype html><html><body></body></html>', {url: "https://recruit.cj.net/recruit/ko/resume/apply.fo"}).window.document;
  doc.body.innerHTML = `<div id="sectionNormalUniversity0"><dd><input readonly id="zz_school_nm2_0" name="zz_school_nm" value=""><input type="hidden" name="school_code" value=""><button type="button" name="bt_zz_school_nm" data-popup-show="" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo?num=2_0">검색</button></dd><dd><input readonly id="zz_state_nm5_0" name="zz_state_nm" value="${region}"><input type="hidden" name="zz_state" value=""><input type="hidden" name="reg_region" value="KOR"><input type="hidden" name="new_country" value="KOR"><button type="button" name="bt_zz_state_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0">검색</button></dd><dd><input id="mm_major_nm2_0" value=""></dd></div>`;
  return doc;
}

describe("CJ school request", () => {
  it("recognizes the exact first-row opener and rejects mutations", () => {
    const dom = new JSDOM('<div id="sectionNormalUniversity0"><dd><input type="text" readonly id="zz_school_nm2_0" name="zz_school_nm"><input type="hidden" name="school_code"><button type="button" name="bt_zz_school_nm" data-popup-show="" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo?num=2_0">검색</button></dd></div>', {url: "https://recruit.cj.net/recruit/ko/resume/apply.fo"});
    const doc = dom.window.document;
    const school = doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!;
    const opener = doc.querySelector<HTMLButtonElement>("button")!;
    const identity = { target: school, fieldGroup: school.closest("dd")!, repeatRow: school.closest("#sectionNormalUniversity0")!, openers: [], openerSignatures: [] } as unknown as TargetIdentity;
    expect(isCjSchoolTarget(doc, "education.university.schoolName", identity, opener)).toBe(true);
    opener.setAttribute("onclick", "other()");
    expect(isCjSchoolTarget(doc, "education.university.schoolName", identity, opener)).toBe(false);
    dom.window.close();
  });
  it("rejects the wrong canonical field despite an otherwise matching opener", () => {
    const doc = row();
    const school = doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!;
    const opener = doc.querySelector<HTMLButtonElement>('[name="bt_zz_school_nm"]')!;
    const identity = { target: school, fieldGroup: school.closest("dd")!, repeatRow: school.closest("#sectionNormalUniversity0")!, openers: [], openerSignatures: [] } as unknown as TargetIdentity;
    expect(isCjSchoolTarget(doc, "education.university.majorName", identity, opener)).toBe(false);
  });
  it("writes the school and country bundle while preserving region, major and new_country", () => {
    const doc = row();
    const school = doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!;
    const bundle = validateCjSchoolRow(school);
    writeCjSchoolBundle(bundle, {code: "SYN001", label: "합성대학교", country: "KOR"});
    expect([school.value, bundle.schoolCode.value, bundle.country.value]).toEqual(["합성대학교", "SYN001", "KOR"]);
    expect(bundle.regionOpener.getAttribute("data-iframe-url"))
      .toBe("https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=KOR");
    expect([bundle.regionDisplay.value, bundle.regionCode.value, doc.querySelector<HTMLInputElement>('[name="new_country"]')!.value, doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!.value])
      .toEqual(["", "", "KOR", ""]);
  });
  it("rejects mismatched preserved new_country before any write", () => {
    const doc = row();
    const bundle = validateCjSchoolRow(doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!);
    expect(() => writeCjSchoolBundle(bundle, {code: "SYN001", label: "합성대학교", country: "USA"})).toThrow();
    expect(bundle.school.value).toBe("");
    expect(bundle.country.value).toBe("KOR");
  });
  it("captures the first-row school and country bundle without touching new_country", () => {
    const doc = row();
    const bundle = validateCjSchoolRow(doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!);
    expect(bundle.schoolCode.value).toBe("");
    expect(bundle.country.value).toBe("KOR");
    expect(bundle.regionOpener.getAttribute("data-iframe-url"))
      .toBe("https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0");
    expect(doc.querySelector<HTMLInputElement>('[name="new_country"]')!.value).toBe("KOR");
  });
  it("rejects populated region before changing country", () => {
    const doc = row("지역기입값");
    expect(() => validateCjSchoolRow(doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!)).toThrow();
  });
  it("rejects a school code already set despite empty display", () => {
    const doc = row();
    doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value = "OTHER";
    expect(() => validateCjSchoolRow(doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!)).toThrow();
  });
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
