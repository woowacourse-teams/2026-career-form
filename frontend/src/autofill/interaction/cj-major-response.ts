import { CJ_MAJOR_URL } from "./cj-major-contract";
import { SearchFailure } from "./search-session";

function fail(): never {
  throw new SearchFailure("result_set_incomplete");
}
const exact = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim();
const rowSelector =
  ".container_wrap > #popupBasic5.popup.popup_major.iframe_opened > .popup_inner > .popup_content > .sec_top > .sec_mid.scroll-list-wrap > .iScroll > .sec_inner > ul.sch_list";
const reviewedScript = `
function goSearch() { $("#mainForm").submit(); }
function setMajorData(dtl_cd, dtl_cd_long_nm, rating_model) {
  var majorData = { dtl_cd: dtl_cd, dtl_cd_long_nm: dtl_cd_long_nm, rating_model: rating_model };
  parent.majorCallback2_0(majorData);
  parent.needpopHide(); // 레이어 닫기
}
function applyMajorData() {
  var dtl_cd_long_nm = $("input[name='direct_dtl_nm']").val();
  setMajorData('', dtl_cd_long_nm, '');
}
$(document).ready(function(){
  $("input[name='dtl_nm']").focus();
  // input tab 입력시 공백으로 치환
  $("input").bind('change',function(e){
    var str = $(this).val();
    str = str.replace(/\\t/g, " ");
    $(this).val(str);
  });
});`;
const scriptPaths = [
  "/recruit/ko/js/jquery-1.11.3.min.js",
  "/recruit/common/js/default.js",
  "/recruit/common/js/jquery.easing.1.3.js",
  "/recruit/common/js/util.js",
  "/recruit/ko/js/ui.common.js",
  "/recruit/ko/js/json2.js",
  "/recruit/common/js/util.js",
  "/recruit/js/jqGrid/frameone.jquery.jqGrid.js",
  "/recruit/ko/js/jquery.common.js",
  "/recruit/ko/js/timer.js",
  "/recruit/ko/js/jquery.ui.datepicker.js",
];
const stripComments = (value: string) =>
  value
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "")
    .trim();

/** Parse as inert HTML. A rendered list is not evidence of backend-wide uniqueness. */
export function parseCjMajorResponse(
  html: string,
  query: string,
  num: string,
): { code: string; label: string } {
  if (
    html.length > 512_000 ||
    !/<\/html>\s*$/i.test(html) ||
    !/<\/body>\s*<\/html>\s*$/i.test(html) ||
    !/<\/ul\s*>/i.test(html) ||
    (html.match(/<li\b/gi) ?? []).length !==
      (html.match(/<\/li\s*>/gi) ?? []).length ||
    (html.match(/<a\b/gi) ?? []).length !==
      (html.match(/<\/a\s*>/gi) ?? []).length
  )
    fail();
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (
    doc.querySelector(
      'parsererror, iframe, object, embed, meta[http-equiv="refresh"]',
    ) ||
    doc.querySelectorAll("form").length !== 1 ||
    doc.querySelectorAll(".sec_mid.scroll-list-wrap").length !== 1 ||
    doc.querySelectorAll("ul.sch_list").length !== 1 ||
    doc.querySelectorAll("ul.list_ex").length !== 1 ||
    doc.querySelectorAll("ul.list_ex > li").length !== 1 ||
    [...doc.querySelectorAll("ul,ol,table")].some(
      (list) => !list.matches("ul.sch_list,ul.list_ex"),
    ) ||
    doc.querySelectorAll("#dtl_nm").length !== 1 ||
    doc.querySelectorAll("input[name=num]").length !== 1 ||
    doc.querySelector(
      'a[href]:not([href="javascript:;"]), button, input:not([name="dtl_nm"]):not([name="num"]):not([type="submit"]), select, textarea',
    ) ||
    doc.querySelector(
      "[class*=page], [class*=loading], [aria-busy], [data-next], [data-total], [onclick]:not(a)",
    )
  )
    fail();
  // A detached DOMParser document has about:blank as base URI. Inspect literal action before DOM URL normalization.
  const form = doc.querySelector<HTMLFormElement>("form")!;
  if (
    form.getAttribute("action") !== CJ_MAJOR_URL ||
    form.id !== "mainForm" ||
    form.getAttribute("name") !== "mainForm" ||
    form.getAttribute("method")?.toLowerCase() !== "post" ||
    form.getAttribute("onsubmit")?.trim() !== "return goSearch();" ||
    form.hasAttribute("target") ||
    form.hasAttribute("enctype") ||
    [...form.attributes].some(
      (attr) =>
        !["id", "name", "action", "method", "onsubmit"].includes(attr.name),
    ) ||
    form.querySelectorAll("input").length !== 3
  )
    fail();
  const hidden = form.querySelector<HTMLInputElement>(
    'input[type="hidden"][name="num"]',
  );
  const input = form.querySelector<HTMLInputElement>(
    'input[type="text"]#dtl_nm[name="dtl_nm"][maxlength="200"]',
  );
  const submit = form.querySelector<HTMLInputElement>(
    'input[type="submit"][value="검색"]',
  );
  const list = form.querySelector<HTMLUListElement>(rowSelector);
  const resultSection = list?.parentElement;
  const top = form.querySelector<HTMLElement>(
    ".container_wrap > #popupBasic5.popup.popup_major.iframe_opened > .popup_inner > .popup_content > .sec_top",
  );
  if (
    !hidden ||
    hidden.value !== num ||
    num !== "2_0" ||
    !input ||
    input.value !== query ||
    !submit ||
    submit.name ||
    ["formaction", "formmethod", "formtarget", "formenctype", "onclick"].some(
      (attr) => submit.hasAttribute(attr),
    ) ||
    !list ||
    !top ||
    top.querySelectorAll(
      ":scope > p.desc.desc_pop_top, :scope > dl.box_ex > dd ul.list_ex",
    ).length !== 2 ||
    top
      .querySelector("ul.list_ex > li")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() !== "시디. Visual Communication Design(X)-시각디자인(O)" ||
    !resultSection ||
    resultSection.children.length !== 1 ||
    resultSection.textContent?.trim() !== list.textContent?.trim() ||
    !form
      .querySelector(
        ".container_wrap > #popupBasic5.popup.popup_major.iframe_opened > .popup_inner > .popup_content > .sec_top > .area_schForm > fieldset",
      )
      ?.contains(input) ||
    list.closest("form") !== form ||
    form.querySelectorAll("ul.sch_list > li").length !== list.children.length ||
    !list.children.length ||
    [...doc.querySelectorAll("a")].some((link) => !list.contains(link)) ||
    [...doc.querySelectorAll("li")].some(
      (item) => !list.contains(item) && !item.closest("ul.list_ex"),
    )
  )
    fail();
  // Reviewed public template: exact script count, order, paths, and canonical inline bodies.
  const scripts = [...doc.querySelectorAll("script")];
  if (scripts.length !== 13 || scripts[1]?.src || scripts[12]?.src) fail();
  if (
    stripComments(scripts[1]!.textContent ?? "") !==
      stripComments(
        "window.jQuery = window.jQuery || {}; window.jQuery.migrateMute = true; console.trace = function() {};",
      ) ||
    stripComments(scripts[12]!.textContent ?? "") !==
      stripComments(reviewedScript)
  )
    fail();
  for (let index = 0; index < scriptPaths.length; index++) {
    const script = scripts[index < 1 ? 0 : index + 1]!;
    const source = script.getAttribute("src");
    if (!source || script.textContent?.trim()) fail();
    const url = new URL(source);
    if (
      url.origin !== "https://imgrec.cj.net" ||
      url.pathname !== scriptPaths[index] ||
      (url.search && !/^\?\d+$/.test(url.search)) ||
      url.hash ||
      url.username ||
      url.password
    )
      fail();
  }
  const records: Array<{ code: string; label: string }> = [];
  const codes = new Set<string>();
  for (const li of list.children) {
    if (
      li.tagName !== "LI" ||
      li.children.length !== 1 ||
      li.firstElementChild?.tagName !== "A"
    )
      fail();
    const link = li.firstElementChild as HTMLAnchorElement;
    const attrs = [...link.attributes]
      .map((a) => a.name)
      .sort()
      .join(",");
    if (
      attrs !== "href,onclick,title" ||
      link.title !== "선택 시 본창에 값이 들어가며 레이어창 닫힘" ||
      link.getAttribute("href") !== "javascript:;" ||
      link.children.length
    )
      fail();
    const handler = link.getAttribute("onclick") ?? "";
    const match =
      /^setMajorData\(\s*'([A-Za-z0-9_-]{1,64})'\s*,\s*'([^'\\\r\n]{1,200})'\s*,\s*''\s*\);?$/.exec(
        handler,
      );
    if (
      !match ||
      exact(link.textContent ?? "") !== exact(match[2]!) ||
      !exact(match[2]!) ||
      codes.has(match[1]!)
    )
      fail();
    codes.add(match[1]!);
    records.push({ code: match[1]!, label: match[2]! });
  }
  const matches = records.filter((row) => exact(row.label) === exact(query));
  if (matches.length !== 1) fail();
  return matches[0]!;
}
