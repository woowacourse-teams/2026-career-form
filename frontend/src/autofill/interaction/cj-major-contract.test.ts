import { describe, expect, it } from "vitest";
import {
  validateCjMajorPreflight,
  validateCjMajorRequest,
} from "./cj-major-contract";
import type { TargetIdentity } from "./readonly-search";
import { JSDOM } from "jsdom";
import { isCjMajorTarget } from "./cj-major-contract";
import { CJ_MAJOR_OPENER_MARKER } from "./cj-major-close-contract";

const fixture = () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<form id="mainForm" name="mainForm" method="post" action="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo" onsubmit="return goSearch();"><input type="hidden" name="num" value="2_0"><div class="container_wrap"><div id="popupBasic5" class="popup popup_major iframe_opened"><div class="popup_inner"><div class="popup_content"><div class="sec_top"><div class="area_schForm"><fieldset><input type="text" class="iText" id="dtl_nm" name="dtl_nm" value="" title="전공명 입력" maxlength="200"><input type="submit" value="검색"></fieldset></div></div></div></div></div></div></form>`;
  return doc;
};
describe("CJ major request contract", () => {
  it("sends only dtl_nm and num in that order", () => {
    expect(
      validateCjMajorRequest(fixture(), "합성전공", "2_0").toString(),
    ).toBe("dtl_nm=%ED%95%A9%EC%84%B1%EC%A0%84%EA%B3%B5&num=2_0");
  });
  it("rejects an extra field instead of serializing the whole application", () => {
    const doc = fixture();
    doc
      .querySelector("fieldset")!
      .insertAdjacentHTML("beforeend", '<input name="private" value="secret">');
    expect(() => validateCjMajorRequest(doc, "합성전공", "2_0")).toThrow();
  });
  it("rejects an already populated same-row code before opening search", () => {
    const doc = fixture();
    doc.body.insertAdjacentHTML(
      "beforeend",
      '<dd><input readonly id="mm_major_nm2_0" name="mm_major_nm"><input type="hidden" name="major" value="EXISTING"></dd>',
    );
    const target = doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!;
    expect(() =>
      validateCjMajorPreflight({ target } as TargetIdentity),
    ).toThrow();
    expect(doc.querySelector<HTMLInputElement>('[name="major"]')!.value).toBe(
      "EXISTING",
    );
  });
  it("recognizes only the id-less opener beside the exact university row target", () => {
    const dom = new JSDOM(
      '<section id="sectionNormalUniversity0"><dd><input readonly id="mm_major_nm2_0" name="mm_major_nm"><input type="hidden" name="major"><button type="button" name="bt_mm_major_nm" data-popup-show="" data-width="504" data-height="600" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0">전공 검색</button></dd><dd><button type="button" name="bt_other" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0">전공 검색</button></dd></section>',
      { url: "https://recruit.cj.net/recruit/ko/resume/apply.fo" },
    );
    const doc = dom.window.document;
    const target = doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!;
    const group = target.closest("dd")!;
    const identity: TargetIdentity = {
      target,
      fieldGroup: group,
      repeatRow: doc.querySelector("#sectionNormalUniversity0")!,
      fieldSignature: "INPUT|text|mm_major_nm2_0|mm_major_nm",
      openers: [],
      openerSignatures: [],
    };
    expect(
      isCjMajorTarget(
        doc,
        "education.university.majorName",
        identity,
        group.querySelector("button")!,
      ),
    ).toBe(true);
    const opener = group.querySelector("button")!;
    opener.setAttribute(
      CJ_MAJOR_OPENER_MARKER,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(
      isCjMajorTarget(doc, "education.university.majorName", identity, opener),
    ).toBe(true);
    expect(
      isCjMajorTarget(
        doc,
        "education.university.majorName",
        identity,
        doc.querySelectorAll("button")[1]!,
      ),
    ).toBe(false);
    opener.setAttribute("onclick", "other()");
    expect(
      isCjMajorTarget(doc, "education.university.majorName", identity, opener),
    ).toBe(false);
    opener.removeAttribute("onclick");
    opener.setAttribute("formaction", "https://example.invalid/collect");
    expect(
      isCjMajorTarget(doc, "education.university.majorName", identity, opener),
    ).toBe(false);
    opener.removeAttribute("formaction");
    opener.setAttribute("data-popup-show", "unexpected");
    expect(
      isCjMajorTarget(doc, "education.university.majorName", identity, opener),
    ).toBe(false);
    dom.window.close();
  });
  it.each([
    '<input type="submit" value="검색" formaction="https://example.invalid/collect">',
    '<input type="submit" value="검색" formtarget="_blank">',
    '<input type="submit" name="private" value="검색">',
    '<input type="submit" value="검색" onclick="other()">',
  ])("rejects altered submit metadata: %s", (replacement) => {
    const doc = fixture();
    doc.querySelector('input[type="submit"]')!.outerHTML = replacement;
    expect(() => validateCjMajorRequest(doc, "합성전공", "2_0")).toThrow();
  });
  it("rejects a control externally associated with mainForm", () => {
    const doc = fixture();
    doc.body.insertAdjacentHTML(
      "beforeend",
      '<input form="mainForm" name="private" value="secret">',
    );
    expect(() => validateCjMajorRequest(doc, "합성전공", "2_0")).toThrow();
  });
  it("rejects altered row context", () => {
    const doc = fixture();
    doc.querySelector('[name="num"]')!.setAttribute("value", "2_1");
    expect(() => validateCjMajorRequest(doc, "합성전공", "2_0")).toThrow();
  });
});
