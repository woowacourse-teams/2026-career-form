import { SearchFailure } from "./search-session";

export const CJ_SCHOOL_URL =
  "https://recruit.cj.net/recruit/ko/resume/search/search_university.fo";

function refuse(): never {
  throw new SearchFailure("unverified_search_form");
}

/** Compose a literal two-scalar POST. Never serialize the site's form. */
export function validateCjSchoolRequest(
  doc: Document,
  query: string,
  num: string,
): URLSearchParams {
  const forms = doc.querySelectorAll<HTMLFormElement>("form");
  const form = forms.length === 1 ? forms[0] : undefined;
  const controls = form?.querySelectorAll("input,button,select,textarea");
  const hidden = form?.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="num"]');
  const text = form?.querySelectorAll<HTMLInputElement>('input[type="text"]#school_name[name="school_name"][maxlength="30"]');
  const submit = form?.querySelectorAll<HTMLInputElement>('input[type="submit"][value="검색"]');
  if (
    !form || forms.length !== 1 || !controls || controls.length !== 3 ||
    form.id !== "mainForm" || form.name !== "mainForm" ||
    form.method.toLowerCase() !== "post" || form.action !== CJ_SCHOOL_URL ||
    form.getAttribute("onsubmit")?.trim() !== "return goSearch();" ||
    [...form.attributes].some(({ name }) => !["name", "id", "action", "method", "onsubmit"].includes(name)) ||
    [...form.querySelectorAll("*")].some(element => [...element.attributes].some(({ name }) => /^on/i.test(name))) ||
    hidden?.length !== 1 || text?.length !== 1 || submit?.length !== 1 ||
    hidden[0]!.value !== "2_0" || num !== "2_0" ||
    [...hidden[0]!.attributes].some(({ name }) => !["type", "name", "value"].includes(name)) ||
    [...text[0]!.attributes].some(({ name }) => !["type", "class", "id", "name", "value", "title", "maxlength"].includes(name)) ||
    [...submit[0]!.attributes].some(({ name }) => !["type", "value"].includes(name)) ||
    text[0]!.getAttribute("value") !== "" || text[0]!.className !== "iText" ||
    text[0]!.title !== "학교명 입력" || text[0]!.disabled || text[0]!.readOnly ||
    submit[0]!.disabled || submit[0]!.name ||
    !query.trim() || query.length > 30 ||
    [...form.elements].some(element => !form.contains(element) || !["INPUT", "FIELDSET"].includes(element.tagName)) ||
    !form.querySelector(".container_wrap > #popupBasic4.popup.popup_college.iframe_opened > .popup_inner > .popup_content > .sec_top > .area_schForm > fieldset")?.contains(text[0]!)
  ) refuse();
  return new URLSearchParams([["school_name", query], ["num", num]]);
}
