import { CJ_SCHOOL_URL } from "./cj-school-contract";
import { SearchFailure } from "./search-session";

function fail(): never {
  throw new SearchFailure("result_set_incomplete");
}
const canonical = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
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
const reviewedScript = `function goSearch() { $("#mainForm").submit(); }
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
// Compare lexical tokens, not whitespace-free text: `var x` and `varx` differ.
// Quoted strings and regex syntax remain byte-exact. Only line comments and
// inter-token whitespace are ignored in the reviewed public source.
function scriptTokens(source: string): string {
  const tokens: string[] = [];
  for (let i = 0; i < source.length;) {
    const char = source[i]!;
    if (/\s/.test(char)) { i++; continue; }
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", i)) fail();
    if (char === "'" || char === '"' || char === "`") {
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i++] === char) { closed = true; break; }
      }
      if (!closed) fail();
      tokens.push(source.slice(start, i));
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = i++;
      while (i < source.length && /[\w$]/.test(source[i]!)) i++;
      tokens.push(source.slice(start, i));
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = i++;
      while (i < source.length && /[0-9]/.test(source[i]!)) i++;
      tokens.push(source.slice(start, i));
      continue;
    }
    tokens.push(char); i++;
  }
  return tokens.join("\u0000");
}
const rowsSelector = ".container_wrap > #popupBasic4.popup.popup_college.iframe_opened > .popup_inner > .popup_content > .sec_top > .sec_mid.scroll-list-wrap > .iScroll > .sec_inner > ul.sch_list";

/** A complete received document proves only rendered-result uniqueness, never database uniqueness. */
export function parseCjSchoolResponse(
  html: string,
  query: string,
  num: string,
): { code: string; label: string; country: string } {
  if (
    html.length > 512_000 ||
    !/<\/body>\s*<\/html>\s*$/i.test(html) ||
    (html.match(/<li\b/gi) ?? []).length !== (html.match(/<\/li\s*>/gi) ?? []).length ||
    (html.match(/<a\b/gi) ?? []).length !== (html.match(/<\/a\s*>/gi) ?? []).length
  ) fail();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const forms = doc.querySelectorAll<HTMLFormElement>("form");
  const form = forms.length === 1 ? forms[0] : undefined;
  const list = form?.querySelector<HTMLUListElement>(rowsSelector);
  const input = form?.querySelector<HTMLInputElement>('input[type="text"]#school_name[name="school_name"][maxlength="30"]');
  if (
    doc.querySelector('parsererror,iframe,object,embed,meta[http-equiv="refresh"], [class*=loading], [aria-busy], [data-next], [data-total], [class*=page]') ||
    !form || form.getAttribute("action") !== CJ_SCHOOL_URL ||
    form.id !== "mainForm" || form.getAttribute("name") !== "mainForm" ||
    form.getAttribute("method")?.toLowerCase() !== "post" ||
    form.getAttribute("onsubmit")?.trim() !== "return goSearch();" ||
    [...form.attributes].some(({ name }) => !["name", "id", "action", "method", "onsubmit"].includes(name)) ||
    form.querySelectorAll("input,button,select,textarea").length !== 3 ||
    doc.querySelector('button,select,textarea,[onclick]:not(a),a[href]:not([href="javascript:;"])') ||
    doc.querySelectorAll("ul.sch_list").length !== 1 ||
    doc.querySelectorAll("ul.list_ex").length !== 1 ||
    doc.querySelectorAll("ul.list_ex > li").length !== 3 ||
    [...doc.querySelectorAll("ul,ol,table")].some(node => !node.matches("ul.sch_list,ul.list_ex")) ||
    !list || !list.children.length || list.parentElement?.children.length !== 1 ||
    [...doc.querySelectorAll("a")].some(link => !list.contains(link)) ||
    [...doc.querySelectorAll("li")].some(item => !list.contains(item) && !item.closest("ul.list_ex")) ||
    !input || input.getAttribute("value") !== query || input.className !== "iText" ||
    form.querySelectorAll('input[type="hidden"][name="num"]').length !== 1 ||
    form.querySelector<HTMLInputElement>('input[name="num"]')?.value !== num || num !== "2_0" ||
    form.querySelectorAll('input[type="submit"][value="검색"]').length !== 1 ||
    form.querySelector<HTMLInputElement>('input[type="submit"]')?.name ||
    [...form.querySelectorAll("input")].some(el => [...el.attributes].some(({ name }) => /^on|^form/i.test(name))) ||
    !form.querySelector(".container_wrap > #popupBasic4.popup.popup_college.iframe_opened > .popup_inner > .popup_content > .sec_top > .area_schForm > fieldset")?.contains(input)
  ) fail();
  const scripts = [...doc.querySelectorAll<HTMLScriptElement>("script")];
  if (scripts.length !== 13 || scripts[1]?.src || scripts[12]?.src ||
    scriptTokens(scripts[1]?.textContent ?? "") !== scriptTokens("window.jQuery = window.jQuery || {}; window.jQuery.migrateMute = true; console.trace = function() {};") ||
    scriptTokens(scripts[12]?.textContent ?? "") !== scriptTokens(reviewedScript)
  ) fail();
  for (let i = 0; i < scriptPaths.length; i++) {
    const source = scripts[i === 0 ? 0 : i + 1]?.getAttribute("src");
    if (!source) fail();
    const url = new URL(source);
    if (url.origin !== "https://imgrec.cj.net" || url.pathname !== scriptPaths[i] ||
      (url.search && !/^\?\d+$/.test(url.search)) || url.hash || url.username || url.password ||
      scripts[i === 0 ? 0 : i + 1]!.textContent?.trim()) fail();
  }
  const codes = new Set<string>();
  const records: Array<{ code: string; label: string; country: string }> = [];
  for (const node of list.children) {
    if (node.tagName !== "LI" || node.children.length !== 1 || node.firstElementChild?.tagName !== "A") fail();
    const link = node.firstElementChild as HTMLAnchorElement;
    if ([...link.attributes].map(({ name }) => name).sort().join(",") !== "href,onclick,title" ||
      link.title !== "선택 시 본창에 값이 들어가며 레이어창 닫힘" || link.getAttribute("href") !== "javascript:;" || link.children.length) fail();
    const literal = /^setUniversityData\(\s*'([A-Za-z0-9_-]{1,64})'\s*,\s*'([^'\\\r\n]{1,200})'\s*,\s*'([A-Z]{2,3})'\s*\);?$/.exec(link.getAttribute("onclick") ?? "");
    if (!literal || canonical(link.textContent ?? "") !== canonical(literal[2]!) || !canonical(literal[2]!) || codes.has(literal[1]!)) fail();
    codes.add(literal[1]!);
    records.push({code: literal[1]!, label: literal[2]!, country: literal[3]!});
  }
  const exact = records.filter(row => canonical(row.label) === canonical(query));
  if (exact.length !== 1) fail();
  return exact[0]!;
}
