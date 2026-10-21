/**
 * CF-177 F5: the MRS2 page chrome around the sections (synthetic, text only)
 * and the one definition of "a click the extension must never make".
 *
 * Opt-in: default builders (mountEducation, mountSyntheticNative, ...) do not
 * add this, so their DOM digests stay byte-identical. Workflow harnesses call
 * `mountPageChrome()` after mounting the page.
 *
 * Placement mirrors the live pages: the step tabs are a `nav#tab` sibling
 * before `form#frm`; the 이전/임시저장/다음 bar, the 동의 checkbox and the 인증
 * button sit inside `form#frm` after the sections (`#wrapResume`), never
 * inside a `section.writeResume`. Every button is a plain `type=button` or
 * `type=submit` with no handler: any click on them is a bug in the extension.
 */

const CHROME_ID = "cf-page-chrome";

export const CHROME_NAV_HTML =
  '<nav id="tab"><button type="button" data-step="1">기본 정보</button><button type="button" data-step="2">학력 경력</button><button type="button" data-step="3">자격 어학</button></nav>';
export const CHROME_BAR_HTML = `<div id="${CHROME_ID}" class="bottomBar"><label class="agree"><input type="checkbox" name="agreeAll"> 개인정보 수집 이용 동의</label><button type="button" class="btnAuth">본인인증</button><button type="button" class="btnPrev">이전</button><button type="submit" class="btnTemp">임시저장</button><button type="submit" class="btnNext">다음</button></div>`;

/** Idempotent; the nav goes before the form, the bar after the sections. */
export function mountPageChrome(
  form: Element = document.querySelector("#frm")!,
): void {
  if (!form) throw new Error("mount the native page before the page chrome");
  if (document.getElementById(CHROME_ID)) return;
  form.insertAdjacentHTML("beforebegin", CHROME_NAV_HTML);
  form.insertAdjacentHTML("beforeend", CHROME_BAR_HTML);
}

/** The staged-address modal's own commit button is an approved local copy. */
const ADDRESS_COMMIT = '#modal.modal-bg button[data-button="modalSubmit"]';
const STEP_TAB = "nav#tab button,#tab button[data-step]";
const BUTTON_LIKE =
  "button,a,[role=button],input[type=button],input[type=submit],input[type=image]";
const BUTTON_LABEL = /^(다음|이전|임시저장|저장|제출|최종제출)$/;
const AUTH_LABEL = /인증|본인확인/;
const AGREE_CHECKBOX = 'input[type=checkbox][name*="agree" i]';
const SITE_ACTIONS =
  "[data-button=remove],[data-button=reset],[data-button=removeCollege],[data-button=resetSearchResult],button[type=submit],input[type=submit],input[type=file]";

/** Selector part of the forbidden set (text rules live in the function). */
export const FORBIDDEN_SELECTOR = [STEP_TAB, AGREE_CHECKBOX, SITE_ACTIONS].join(
  ",",
);

const text = (el: Element) =>
  (el.tagName === "INPUT"
    ? (el as HTMLInputElement).value
    : (el.textContent ?? "")
  )
    .replace(/\s+/g, " ")
    .trim();

/** True when a click on `target` is a step move, save, submit, consent, auth or file action. */
export function isForbiddenClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(ADDRESS_COMMIT)) return false;
  if (target.matches(FORBIDDEN_SELECTOR) || target.closest(STEP_TAB))
    return true;
  const label = target.closest("label");
  if (label && /동의/.test(text(label))) return true;
  const control = target.closest(BUTTON_LIKE);
  if (!control || control.closest(".searchResult")) return false;
  const name = text(control);
  return BUTTON_LABEL.test(name) || AUTH_LABEL.test(name);
}
