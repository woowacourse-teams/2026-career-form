import { SearchFailure } from "./search-session";
import type { SearchSurface } from "./search-surface";
import type { TargetIdentity } from "./readonly-search";
import { validMajorOpener } from "./cj-major-close-contract";

export const CJ_MAJOR_URL =
  "https://recruit.cj.net/recruit/ko/resume/search/search_major.fo";
const onlyAttributes = (element: Element, names: readonly string[]) =>
  [...element.attributes].every(({ name }) => names.includes(name));
function bad(): never {
  throw new SearchFailure("unverified_search_form");
}

/** No FormData: the approved request consists exclusively of two explicit scalar values. */
export function validateCjMajorRequest(
  doc: Document,
  query: string,
  num: string,
): URLSearchParams {
  const forms = doc.querySelectorAll<HTMLFormElement>("form");
  const form = forms.length === 1 ? forms[0] : undefined;
  if (
    !form ||
    form.id !== "mainForm" ||
    form.name !== "mainForm" ||
    form.method.toLowerCase() !== "post" ||
    form.action !== CJ_MAJOR_URL ||
    form.hasAttribute("target") ||
    form.hasAttribute("enctype") ||
    form.getAttribute("onsubmit")?.trim() !== "return goSearch();" ||
    form.querySelectorAll("input,button,select,textarea").length !== 3 ||
    !onlyAttributes(form, ["name", "id", "action", "method", "onsubmit"]) ||
    [...form.querySelectorAll("*")].some((element) =>
      [...element.attributes].some((attribute) => /^on/i.test(attribute.name)),
    )
  )
    bad();
  const hidden = form.querySelectorAll<HTMLInputElement>(
    'input[type="hidden"][name="num"]',
  );
  const text = form.querySelectorAll<HTMLInputElement>(
    'input[type="text"]#dtl_nm[name="dtl_nm"][maxlength="200"]',
  );
  const submit = form.querySelectorAll<HTMLInputElement>(
    'input[type="submit"][value="검색"]',
  );
  if (
    hidden.length !== 1 ||
    text.length !== 1 ||
    submit.length !== 1 ||
    hidden[0]!.value !== num ||
    !onlyAttributes(hidden[0]!, ["type", "name", "value"]) ||
    !onlyAttributes(text[0]!, [
      "type",
      "class",
      "id",
      "name",
      "value",
      "title",
      "maxlength",
    ]) ||
    !onlyAttributes(submit[0]!, ["type", "value"]) ||
    text[0]!.getAttribute("value") !== "" ||
    text[0]!.className !== "iText" ||
    text[0]!.title !== "전공명 입력" ||
    num !== "2_0" ||
    !query.trim() ||
    query.length > 200 ||
    text[0]!.form !== form ||
    text[0]!.disabled ||
    text[0]!.readOnly ||
    submit[0]!.form !== form ||
    submit[0]!.disabled ||
    submit[0]!.name ||
    ["formaction", "formmethod", "formtarget", "formenctype"].some((attr) =>
      submit[0]!.hasAttribute(attr),
    ) ||
    [...form.elements].some(
      (el) =>
        !form.contains(el) ||
        (el.tagName !== "FIELDSET" && el.tagName !== "INPUT"),
    ) ||
    !form
      .querySelector(
        ".container_wrap > #popupBasic5.popup.popup_major.iframe_opened > .popup_inner > .popup_content > .sec_top > .area_schForm > fieldset",
      )
      ?.contains(text[0]!)
  )
    bad();
  return new URLSearchParams([
    ["dtl_nm", query],
    ["num", num],
  ]);
}

export function isCjMajorCandidate(
  doc: Document,
  key: string,
  identity: TargetIdentity,
): boolean {
  return (
    doc.location.origin === "https://recruit.cj.net" &&
    key === "education.university.majorName" &&
    // Intent must not depend on mutable row metadata: drift must be refused,
    // not routed around this contract to the generic opener click.
    identity.target.ownerDocument === doc
  );
}

export function isCjMajorTarget(
  doc: Document,
  key: string,
  identity: TargetIdentity,
  opener: Element,
): boolean {
  if (
    doc.location.origin !== "https://recruit.cj.net" ||
    key !== "education.university.majorName" ||
    identity.target.id !== "mm_major_nm2_0" ||
    identity.target.name !== "mm_major_nm" ||
    !identity.target.closest("#sectionNormalUniversity0") ||
    !identity.target.readOnly ||
    !validMajorOpener(opener) ||
    opener.closest("dd") !== identity.target.closest("dd") ||
    opener.closest("#sectionNormalUniversity0") !==
      identity.target.closest("#sectionNormalUniversity0") ||
    !identity.fieldGroup.contains(opener) ||
    (identity.repeatRow && !identity.repeatRow.contains(opener))
  )
    return false;
  return true;
}

export function validateCjMajorPreflight(identity: TargetIdentity): void {
  const hidden = identity.target
    .closest("dd")
    ?.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="major"]');
  if (
    hidden?.length !== 1 ||
    hidden[0]!.value !== "" ||
    identity.target.value !== "" ||
    !identity.target.readOnly
  )
    bad();
}

export function validateCjMajorSurface(
  surface: SearchSurface,
  expected: string,
): {
  num: string;
  query: HTMLInputElement;
  code: HTMLInputElement;
} {
  if (
    surface.kind !== "same-origin-iframe" ||
    !surface.frame ||
    surface.document.location.origin !== "https://recruit.cj.net" ||
    surface.document.location.pathname !==
      "/recruit/ko/resume/search/search_major.fo" ||
    surface.document.location.search !== "?num=2_0"
  )
    bad();
  const query = surface.document.querySelector<HTMLInputElement>(
    'input#dtl_nm[name="dtl_nm"]',
  );
  const code = surface.target
    .closest("dd")
    ?.querySelector<HTMLInputElement>('input[type="hidden"][name="major"]');
  if (!query || !code || code.value || query.value || !surface.target.readOnly)
    bad();
  validateCjMajorRequest(surface.document, expected, "2_0");
  return { num: "2_0", query, code };
}
