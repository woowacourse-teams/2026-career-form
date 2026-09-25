import { SearchFailure } from "./search-session";
import type { TargetIdentity } from "./readonly-search";
import { validSchoolOpener } from "./cj-major-close-contract";

export const CJ_SCHOOL_URL =
  "https://recruit.cj.net/recruit/ko/resume/search/search_university.fo";

export const CJ_SCHOOL_POPUP_URL = `${CJ_SCHOOL_URL}?num=2_0`;
export const CJ_REGION_URL =
  "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0";

export interface CjSchoolRow {
  row: Element;
  school: HTMLInputElement;
  schoolCode: HTMLInputElement;
  country: HTMLInputElement;
  newCountry: HTMLInputElement;
  regionDisplay: HTMLInputElement;
  regionCode: HTMLInputElement;
  regionOpener: HTMLButtonElement;
  schoolOpener: HTMLButtonElement;
  existingUrl: string;
  existingCountry: string;
}

/** Refuse populated region: a school country could invalidate that unapproved value. */
export function validateCjSchoolRow(school: HTMLInputElement, expectedExisting?: string): CjSchoolRow {
  const row = school.closest("#sectionNormalUniversity0");
  function one<T extends Element>(selector: string): T | undefined {
    const nodes = row?.querySelectorAll<T>(selector);
    return nodes?.length === 1 ? nodes[0] : undefined;
  }
  const schoolCode = one<HTMLInputElement>('input[type="hidden"][name="school_code"]');
  const country = one<HTMLInputElement>('input[type="hidden"][name="reg_region"]');
  const newCountry = one<HTMLInputElement>('input[type="hidden"][name="new_country"]');
  const regionDisplay = one<HTMLInputElement>('input#zz_state_nm5_0[name="zz_state_nm"]');
  const regionCode = one<HTMLInputElement>('input[type="hidden"][name="zz_state"]');
  const regionOpener = one<HTMLButtonElement>('button[name="bt_zz_state_nm"]');
  const schoolOpener = one<HTMLButtonElement>('button[name="bt_zz_school_nm"]');
  const original = regionOpener?.getAttribute("data-iframe-url") ?? "";
  const regionUrl = (() => { try { return new URL(original); } catch { return undefined; } })();
  // A displayed school is never sufficient by itself. Re-execution requires an
  // existing code and an explicit, consistent country URL, then checks the
  // exact code against the inert public response before returning unchanged.
  const existing = expectedExisting !== undefined && school.value === expectedExisting;
  if (!row || !row.isConnected || school.id !== "zz_school_nm2_0" ||
      school.name !== "zz_school_nm" || school.type !== "text" || !school.readOnly ||
      (!existing && school.value !== "") || !schoolCode ||
      (existing ? !/^[A-Za-z0-9_-]{1,64}$/.test(schoolCode.value) ||
        !/^[A-Z]{2,3}$/.test(country?.value ?? "") ||
        regionUrl?.searchParams.get("country_cd") !== country?.value : schoolCode.value !== "") ||
      !country || !newCountry || !regionDisplay || !regionDisplay.readOnly || regionDisplay.value !== "" ||
      !regionCode || regionCode.value !== "" || !regionOpener || !schoolOpener ||
      schoolOpener.type !== "button" || schoolOpener.getAttribute("data-iframe-url") !== CJ_SCHOOL_POPUP_URL ||
      schoolOpener.closest("dd") !== school.closest("dd") ||
      regionOpener.type !== "button" ||
      regionUrl?.origin !== "https://recruit.cj.net" ||
      regionUrl.pathname !== "/recruit/ko/resume/search/search_school_place.fo" ||
      regionUrl.searchParams.get("num") !== "5_0" ||
      regionUrl.searchParams.size > 2 ||
      (existing && regionUrl.searchParams.size !== 2) ||
      (regionUrl.searchParams.size === 2 &&
        (!regionUrl.searchParams.has("country_cd") ||
          regionUrl.searchParams.get("country_cd") !== country.value)) ||
      regionUrl.hash || regionUrl.username || regionUrl.password
  ) refuse();
  return { row, school, schoolCode, country, newCountry, regionDisplay, regionCode,
    regionOpener, schoolOpener, existingUrl: original, existingCountry: country.value };
}

const nativeSet = (input: HTMLInputElement, value: string): void => {
  const view = input.ownerDocument.defaultView;
  const setter = view && Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
  if (!setter) refuse();
  setter.call(input, value);
};

/** Synchronous four-effect bundle; cleanup may only restore values still owned by this write. */
export function writeCjSchoolBundle(
  bundle: CjSchoolRow,
  selected: {code: string; label: string; country: string},
  onFirstEffect?: () => void,
): () => void {
  const {school, schoolCode, country, regionDisplay, regionCode, regionOpener} = bundle;
  const newUrl = `${CJ_REGION_URL}&country_cd=${encodeURIComponent(selected.country)}`;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(selected.code) ||
      !selected.label.trim() || !/^[A-Z]{2,3}$/.test(selected.country) ||
      !bundle.row.isConnected || !school.isConnected || !schoolCode.isConnected ||
      !country.isConnected || !regionOpener.isConnected ||
      regionOpener.closest("#sectionNormalUniversity0") !== bundle.row ||
      school.value !== "" || schoolCode.value !== "" ||
      country.value !== bundle.existingCountry ||
      regionOpener.getAttribute("data-iframe-url") !== bundle.existingUrl ||
      regionDisplay.value !== "" || regionCode.value !== "") refuse();
  const restore = () => {
    if (school.closest("#sectionNormalUniversity0") === bundle.row && school.value === selected.label) nativeSet(school, "");
    if (schoolCode.closest("#sectionNormalUniversity0") === bundle.row && schoolCode.value === selected.code) nativeSet(schoolCode, "");
    if (country.closest("#sectionNormalUniversity0") === bundle.row && country.value === selected.country &&
        bundle.existingCountry !== selected.country) nativeSet(country, bundle.existingCountry);
    if (regionOpener.closest("#sectionNormalUniversity0") === bundle.row && regionOpener.getAttribute("data-iframe-url") === newUrl)
      regionOpener.setAttribute("data-iframe-url", bundle.existingUrl);
  };
  try {
    try { nativeSet(school, selected.label); }
    finally { if (school.value === selected.label) onFirstEffect?.(); }
    nativeSet(schoolCode, selected.code);
    nativeSet(country, selected.country);
    regionOpener.setAttribute("data-iframe-url", newUrl);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

export function isCjSchoolCandidate(
  doc: Document, key: string, identity: TargetIdentity,
): boolean {
  return doc.location?.origin === "https://recruit.cj.net" &&
    key === "education.university.schoolName" &&
    identity.target.ownerDocument === doc;
}

export function isCjSchoolTarget(
  doc: Document, key: string, identity: TargetIdentity, opener: Element,
): boolean {
  return isCjSchoolCandidate(doc, key, identity) &&
    identity.target.id === "zz_school_nm2_0" &&
    identity.target.name === "zz_school_nm" &&
    identity.target.type === "text" && identity.target.readOnly &&
    identity.target.closest("#sectionNormalUniversity0") !== null &&
    validSchoolOpener(opener) &&
    opener.closest("dd") === identity.target.closest("dd") &&
    opener.closest("#sectionNormalUniversity0") === identity.target.closest("#sectionNormalUniversity0") &&
    identity.fieldGroup.contains(opener) &&
    (!identity.repeatRow || identity.repeatRow.contains(opener));
}

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
