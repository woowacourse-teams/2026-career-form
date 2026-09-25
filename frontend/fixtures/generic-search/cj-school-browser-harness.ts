import { collectFieldsSnapshot } from "../../src/autofill/dom/collect";
import { installCjMajorCloseBridge } from "../../src/autofill/interaction/cj-major-close-bridge";
import { CJ_MAJOR_HIDE_SOURCE, CJ_MAJOR_SHOW_SOURCE, reviewedMethod } from "../../src/autofill/interaction/cj-major-close-contract";
import { executeReadonlySearch } from "../../src/autofill/interaction/readonly-search-executor";

/** Synthetic browser + public CJ search only. Not installed-extension or application proof.
 * Bundle as trusted IIFE and inject only into a disposable blank document at the CJ origin.
 */
declare global { interface Window {
  __CF112_SYNTHETIC_HARNESS__?: boolean;
  needPopup?: { init: () => void; show: unknown; hide: unknown };
  jQuery?: {fn: {tabkeyListener?: unknown}};
} }
const ROOT = "[data-cf112-synthetic-harness]";
const ORIGIN = "https://recruit.cj.net";
const SCHOOL = "서울대학교"; // Public, nonpersonal term, never a user profile value.
const REGION_URL = "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0";
function wrapperOnly(): boolean {
  const wrappers = document.querySelectorAll<HTMLElement>(".popup_wrapper");
  if (wrappers.length > 1) return false;
  if (!wrappers.length) return true;
  const wrapper = wrappers[0]!;
  if (wrapper.parentElement !== document.body || [...wrapper.children].some(child => !child.matches("#popupIframe2.popup")) || wrapper.children.length > 1) return false;
  if (!wrapper.children.length) return true;
  const popup = wrapper.firstElementChild!;
  const children = [...popup.children];
  return children.length === 4 && children.filter(child => child.matches(".popup_inner")).length === 1 &&
    children.filter(child => child.matches('a#popup_cls.popup_cls[href="#"]')).length === 1 &&
    children.filter(child => child.matches("span.tab_span")).length === 2 &&
    popup.querySelectorAll(":scope > .popup_inner > iframe").length === 1;
}
function fixture(): HTMLElement {
  const root = document.querySelector<HTMLElement>(ROOT);
  const row = root?.querySelector("#sectionNormalUniversity0");
  const opener = row?.querySelector<HTMLButtonElement>('button[name="bt_zz_school_nm"]');
  if (location.origin !== ORIGIN || window.__CF112_SYNTHETIC_HARNESS__ !== true ||
    !root || document.querySelectorAll(ROOT).length !== 1 || document.querySelector("form") || !wrapperOnly() ||
    [...document.body.children].some(child => child !== root && child.tagName !== "SCRIPT" && !child.matches(".popup_wrapper")) ||
    !row || document.querySelectorAll("#sectionNormalUniversity0").length !== 1 ||
    !opener || opener.id || opener.type !== "button" || opener.title !== "학교 검색" ||
    opener.getAttribute("data-popup-show") !== "" ||
    opener.getAttribute("data-iframe-url") !== "https://recruit.cj.net/recruit/ko/resume/search/search_university.fo?num=2_0" ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="bt_zz_school_nm"]').length !== 1 ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="school_code"]').length !== 1 ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="reg_region"]').length !== 1 ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="new_country"]').length !== 1 ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="bt_zz_state_nm"]').length !== 1 ||
    document.querySelectorAll('#zz_school_nm2_0, #zz_state_nm5_0').length !== 2 ||
    [...document.querySelectorAll("input, button")].some(control => !root.contains(control)))
    throw new Error("Only the isolated CF-112 fixture is supported");
  return root;
}
function control<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error("Synthetic fixture control missing");
  return value;
}
const root = fixture();
const target = control<HTMLInputElement>(root, "#zz_school_nm2_0");
const code = control<HTMLInputElement>(root, '[name="school_code"]');
const country = control<HTMLInputElement>(root, '[name="reg_region"]');
const newCountry = control<HTMLInputElement>(root, '[name="new_country"]');
const region = control<HTMLInputElement>(root, "#zz_state_nm5_0");
const regionCode = control<HTMLInputElement>(root, '[name="zz_state"]');
const regionOpener = control<HTMLButtonElement>(root, '[name="bt_zz_state_nm"]');
const other = control<HTMLInputElement>(root, "#cf112-other-field");
const otherCode = control<HTMLInputElement>(root, "#cf112-other-code");
const otherCheck = control<HTMLInputElement>(root, "#cf112-other-check");
const runButton = control<HTMLButtonElement>(root, "#cf112-run");
const resetButton = control<HTMLButtonElement>(root, "#cf112-reset");
const output = control<HTMLOutputElement>(root, "#cf112-result");
const unrelatedInitial = [other.value, otherCode.value, otherCheck.checked] as const;
let running = false;
let runCount = 0;
const preserved = () => other.value === unrelatedInitial[0] && otherCode.value === unrelatedInitial[1] && otherCheck.checked === unrelatedInitial[2];
const closed = () => !document.querySelector("#popupIframe2, #popup_cls");
const report = (value: Record<string, string | number | boolean>) => {output.textContent = JSON.stringify(value, null, 2);};
async function run(): Promise<void> {
  try { fixture(); } catch {report({status:"unsupported", reason:"not_synthetic_fixture"});return;}
  if (running || target.value || code.value || country.value !== "USA" || newCountry.value !== "USA" || region.value || regionCode.value ||
    regionOpener.getAttribute("data-iframe-url") !== REGION_URL || !closed() || !preserved()) {
    report({status:"unsupported", reason:"synthetic_state_not_reset"});return;
  }
  running = true;runButton.disabled = true;resetButton.disabled = true;
  const iteration = ++runCount;
  const startedAt = performance.now();
  let retainedSince: number | undefined;
  const reflected = () => target.value === SCHOOL && /^[A-Za-z0-9_-]{1,64}$/.test(code.value) && country.value === "KOR" &&
    regionOpener.getAttribute("data-iframe-url") === `${REGION_URL}&country_cd=KOR` && closed();
  const sample = () => {if (reflected()) retainedSince ??= performance.now(); else retainedSince = undefined;};
  const interval = window.setInterval(sample, 20);
  try {
    const snapshot = collectFieldsSnapshot(document);
    const candidates = snapshot.request.sections.flatMap(section => [...section.fields, ...(section.items?.flatMap(item => item.fields) ?? [])])
      .filter(field => {const lookup = snapshot.registry.lookupField(field.candidateId);
        return lookup.status === "blocked" && lookup.reason === "readonly" && lookup.handle.elements[0] === target;});
    if (candidates.length !== 1) {report({iteration,status:"unsupported",reason:"target_registry_ambiguous"});return;}
    // The production executor performs public POST, inert parsing, atomic writes and reviewed popup close.
    // This harness never runs the site's callback, bookmark, native submit or real application.
    const result = await executeReadonlySearch({document,registry:snapshot.registry,targetCandidateId:candidates[0]!.candidateId,
      canonicalFieldKey:"education.university.schoolName",expectedValue:SCHOOL,expectedCurrentValue:"",
      assertCurrent:() => {try{return fixture() === root && root.isConnected;}catch{return false;}}});
    sample();
    if (result.status === "selected" && retainedSince !== undefined) {
      while (performance.now() - retainedSince < 500) {
        await new Promise<void>(resolve => window.setTimeout(resolve,20));sample();
        if (retainedSince === undefined) break;
      }
    }
    const retainedMs = retainedSince === undefined ? 0 : Math.floor(performance.now() - retainedSince);
    const pass = result.status === "selected" && retainedMs >= 500 && reflected() && newCountry.value === "USA" &&
      !region.value && !regionCode.value && preserved();
    report({iteration,status:result.status,reason:"reason" in result ? result.reason : "none",effect:result.effect ?? "none",
      elapsedMs:Math.floor(performance.now()-startedAt),retainedMs,retainedAtLeast500Ms:retainedMs>=500,
      displayMatches:target.value===SCHOOL,codeNonempty:/^[A-Za-z0-9_-]{1,64}$/.test(code.value),countryChanged:country.value==="KOR",
      countryUrlUpdated:regionOpener.getAttribute("data-iframe-url")===`${REGION_URL}&country_cd=KOR`,
      newCountryPreserved:newCountry.value==="USA",regionUntouched:!region.value&&!regionCode.value,
      popupClosed:closed(),unrelatedPreserved:preserved(),pass});
  } catch {report({iteration,status:"failed",reason:"harness_exception"});}
  finally {window.clearInterval(interval);running=false;resetButton.disabled=!closed();}
}
function reset(): void {
  try {fixture();} catch {report({status:"unsupported",reason:"not_synthetic_fixture"});return;}
  if (running || !closed()) {report({status:"unsupported",reason:"popup_must_close_before_reset"});return;}
  target.value="";code.value="";country.value="USA";newCountry.value="USA";region.value="";regionCode.value="";
  regionOpener.setAttribute("data-iframe-url",REGION_URL);
  report({status:"reset",readyForRun:true,unrelatedPreserved:preserved()});
  runButton.disabled=false;resetButton.disabled=true;
}
if (typeof window.jQuery?.fn.tabkeyListener !== "function" || typeof window.needPopup?.init !== "function")
  report({status:"unsupported",reason:"public_popup_dependency_unavailable"});
else if (!reviewedMethod(window.needPopup.show,CJ_MAJOR_SHOW_SOURCE) || !reviewedMethod(window.needPopup.hide,CJ_MAJOR_HIDE_SOURCE))
  report({status:"unsupported",reason:"popup_source_not_reviewed"});
else {
  try {
    installCjMajorCloseBridge(document);window.needPopup.init();fixture();
    runButton.addEventListener("click",()=>{void run();});resetButton.addEventListener("click",reset);
    runButton.disabled=false;report({status:"ready",synthetic:true,exactOrigin:true,reviewedPublicPopupSource:true});
  } catch {report({status:"unsupported",reason:"popup_initialization_failed"});}
}
