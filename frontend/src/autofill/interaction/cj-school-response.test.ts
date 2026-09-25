import { describe, expect, it } from "vitest";
import { parseCjSchoolResponse } from "./cj-school-response";
import publicTemplate from "./cj-school-public-response.fixture.html?raw";

const externals = [
  "/recruit/ko/js/jquery-1.11.3.min.js",
  "/recruit/common/js/default.js?201304181746",
  "/recruit/common/js/jquery.easing.1.3.js",
  "/recruit/common/js/util.js",
  "/recruit/ko/js/ui.common.js",
  "/recruit/ko/js/json2.js",
  "/recruit/common/js/util.js?201304181746",
  "/recruit/js/jqGrid/frameone.jquery.jqGrid.js",
  "/recruit/ko/js/jquery.common.js",
  "/recruit/ko/js/timer.js?201304181746",
  "/recruit/ko/js/jquery.ui.datepicker.js",
];
const script = `function goSearch() { $("#mainForm").submit(); }
function setUniversityData(dtl_cd, dtl_cd_long_nm, country_cd) {
 var universityData = { dtl_cd: dtl_cd, dtl_cd_long_nm: dtl_cd_long_nm, country_cd: country_cd };
 parent.universityCallback2_0(universityData);
 parent.needpopHide(); // 레이어 닫기
}
function applyUniversityData() {
 var school_name = $("input[name='direct_school_name']").val();
 setUniversityData('', school_name, '');
}
$(document).ready(function(){
 $("input[name='school_name']").focus();
 $("input").bind('change',function(e){
 var str = $(this).val();
 str = str.replace(/\\t/g, " ");
 $(this).val(str);
 });
});`;
const row = (code: string, name: string, country = "KOR") =>
  `<li><a href="javascript:;" onclick="setUniversityData('${code}', '${name}', '${country}')" title="선택 시 본창에 값이 들어가며 레이어창 닫힘">${name}</a></li>`;
function response(rows: string, query = "합성대학교", num = "2_0") {
  const sources = externals.map(path => `<script src="https://imgrec.cj.net${path}"></script>`);
  return `<!DOCTYPE html><html><head>${sources[0]}<script>window.jQuery = window.jQuery || {}; window.jQuery.migrateMute = true; console.trace = function() {};</script>${sources.slice(1).join("")}</head><body><script>${script}</script><form id="mainForm" name="mainForm" method="post" action="https://recruit.cj.net/recruit/ko/resume/search/search_university.fo" onsubmit="return goSearch();"><input type="hidden" name="num" value="${num}"><div class="container_wrap"><div id="popupBasic4" class="popup popup_college iframe_opened"><div class="popup_inner"><div class="popup_content"><div class="sec_top"><p class="desc desc_pop_top">교육부에 등록되어 있는 학교명을 정확히 입력하시고, [검색]버튼을 클릭하세요</p><dl class="box_ex"><dd><ul class="list_ex"><li>성대, 성균관대(X)-성균관대학교(O)</li><li>UCLA(X)-University of California Los Angeles(O)</li><li>Peking University(X)-북경대학교, Beijing Univ(O)</li></ul></dd></dl><div class="area_schForm"><fieldset><input type="text" class="iText" id="school_name" name="school_name" value="${query}" title="학교명 입력" maxlength="30"><input type="submit" value="검색"></fieldset></div><div class="sec_mid scroll-list-wrap"><div class="iScroll"><div class="sec_inner"><ul class="sch_list">${rows}</ul></div></div></div></div></div></div></div></div></form></body></html>`;
}

describe("CJ school inert response", () => {
  it("parses the sanitized complete public POST response without executing its script", () => {
    expect(parseCjSchoolResponse(publicTemplate, "합성대학교", "2_0"))
      .toEqual({ code: "SYN001", label: "합성대학교", country: "KOR" });
  });
  it("selects only one exact label from the complete rendered response", () => {
    expect(parseCjSchoolResponse(response(row("SYN001", "합성대학교") + row("SYN002", "합성대학교(캠퍼스)")), "합성대학교", "2_0"))
      .toEqual({ code: "SYN001", label: "합성대학교", country: "KOR" });
  });
  it.each([
    response(row("SYN001", "합성대학교"), "다른대학교"),
    response(row("SYN001", "합성대학교"), "합성대학교", "2_1"),
    response(row("SYN001", "합성대학교") + row("SYN002", "합성대학교")),
    response(row("", "합성대학교")),
    response(row("SYN001", "합성대학교", "")),
    response(row("SYN001", "합성대학교")).replace("</html>", ""),
    response(row("SYN001", "합성대학교")).replace('class="sch_list"', 'class="sch_list loading"'),
    response(row("SYN001", "합성대학교")).replace("</body>", '<button>다음 페이지</button></body>'),
    response(row("SYN001", "합성대학교")).replace("parent.universityCallback2_0", "parent.evilCallback"),
    response(row("SYN001", "합성대학교")).replace('name="num" value="2_0"', 'name="num" value="2_0"><input name="private" value="secret"'),
  ])("rejects ambiguous or unverified result data", (html) => {
    expect(() => parseCjSchoolResponse(html, "합성대학교", "2_0")).toThrow();
  });
});
