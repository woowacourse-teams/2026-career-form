// Page function (serialized into the page): blocks the actions a QA round must
// never trigger. Blocked: clicks on save, temp-save, step-move, submit, apply,
// preview, consent, verification and logout controls (by caption, icon text or
// handler name) and on file inputs and step tabs, plus form submission by
// event or by script. The extension's own panel and launcher are exempt. Only
// counters and fixed UI captions are kept; no values are read.
export function installGuard() {
  if (window.__careerFormLiveQa) window.__careerFormLiveQa.disarm();
  const state = {
    forbiddenClicks: 0,
    formSubmissions: 0,
    passed: true,
    // Fixed UI identity of blocked controls (never input values).
    blocked: [],
  };
  const CONTROL =
    'button, a, input, label, [role="tab"], [role="button"], [onclick], [data-tab], button[data-step], a[data-step]';
  const describe = (node) => {
    const control = node instanceof Element ? node.closest(CONTROL) : null;
    if (!control) return null;
    const text =
      control instanceof HTMLInputElement
        ? ""
        : (control.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
    return [
      control.tagName.toLowerCase(),
      control.id ? "#" + control.id : "",
      control.getAttribute("data-button")
        ? "[data-button=" + control.getAttribute("data-button") + "]"
        : "",
      control.hasAttribute("data-step") ? "[data-step]" : "",
      " " + text,
    ].join("");
  };
  const reject = (kind, event) => {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    state[kind]++;
    state.passed = false;
  };
  // Identifier words: camelCase, snake_case and kebab-case split
  // ("btnNextStep" -> btn next step), so icon-only controls are judged by
  // their ids, classes and handler names.
  const words = (identifier) =>
    identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(/[^A-Za-z0-9]+/)
      .map((w) => w.toLowerCase())
      .filter(Boolean);
  // Forbidden anywhere in an identifier (not "final": 최종학력 fields; not
  // "cert": 자격증 fields).
  const ANY_WORD =
    /^(save|submit|temp|preview|sms|otp|verify|agree|agreement|consent|logout|signout)$/;
  // Forbidden only as the whole identifier apart from filler words ("goNext",
  // "btn_next", "nextStep"), so "addPrevCareer" or "nextJob" stay clickable.
  const WHOLE_WORD = /^(next|prev|previous|back|apply|send)$/;
  const FILLER =
    /^(btn|button|go|fn|do|on|click|move|to|js|step|page|ico|icon|arrow|link)$/;
  const forbiddenIdentifier = (identifier) => {
    const list = words(identifier);
    if (list.some((w) => ANY_WORD.test(w))) return true;
    const rest = list.filter((w) => !FILLER.test(w));
    return rest.length === 1 && WHOLE_WORD.test(rest[0]);
  };
  // The whole caption is a step move: 다음, 다음 단계로, 이전으로, Next, Back.
  const NAVIGATION =
    /^(?:(?:이전|다음)(?:\s*(?:단계|페이지))?\s*(?:으로|로)?|(?:prev(?:ious)?|next|back|continue)(?:\s*(?:step|page))?)\s*[>›»<‹«]?$/i;
  const CAPTION =
    /임시\s*저장|최종\s*제출|제출|미리\s*보기|\bYBM\b|지원\s*하기|지원서\s*(?:제출|접수)|작성\s*완료|인증\s*(?:번호|요청|하기)|본인\s*인증|(?:전체|모두|약관)\s*동의|로그아웃|저장|submit|temp.?save|save.?temp|preview/i;
  const forbidden = (element) => {
    if (!(element instanceof Element)) return false;
    const control = element.closest(CONTROL);
    if (!control) return false;
    // The Hplace address modal's commit button (저장), which the extension's
    // staged address flow clicks itself.
    if (
      control.matches(
        '#modal.modal-bg > .modal button[data-button="modalSubmit"]',
      )
    )
      return false;
    if (control.tagName === "LABEL" && control.control?.type === "file")
      return true;
    if (
      control.matches(
        'input[type="file"], input[type="submit"], input[type="image"], [role="tab"], [data-tab], button[data-step], a[data-step], nav#tab button, #tab button',
      )
    )
      return true;
    if (control instanceof HTMLButtonElement && control.type === "submit")
      return true;
    const attrs = [
      control.id,
      control.getAttribute("name"),
      control.getAttribute("class"),
      control.getAttribute("onclick"),
      control.getAttribute("href"),
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("data-button"),
      control.getAttribute("data-type"),
      control.getAttribute("data-action"),
    ].join(" ");
    const captions = [
      control instanceof HTMLInputElement
        ? control.value
        : (control.textContent ?? ""),
      control.getAttribute("aria-label") ?? "",
      control.getAttribute("title") ?? "",
    ];
    for (const icon of control.querySelectorAll("img, [title], [aria-label]"))
      captions.push(
        icon.getAttribute("alt") ?? "",
        icon.getAttribute("title") ?? "",
        icon.getAttribute("aria-label") ?? "",
      );
    const clean = captions
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    // 이전/다음 only as a whole caption, so "이전 경력 추가" or "다음 주소
    // 검색" stay clickable.
    return (
      clean.some((t) => NAVIGATION.test(t)) ||
      clean.some((t) => CAPTION.test(t)) ||
      attrs.split(/[^A-Za-z0-9_$-]+/).some(forbiddenIdentifier) ||
      /(?:^|[\s_-])tab(?:[\s_-]|$)|moveTab|changeTab|selectTab/i.test(attrs)
    );
  };
  const exempt = (path) =>
    path.some(
      (node) =>
        node instanceof Element &&
        (node.tagName.toLowerCase() === "career-form-profile-panel" ||
          node.hasAttribute("data-career-form-side-panel-launcher")),
    );
  const onClick = (event) => {
    const path = event.composedPath();
    if (exempt(path)) return;
    const hit = path.find(forbidden);
    if (hit) {
      if (state.blocked.length < 10) state.blocked.push(describe(hit));
      reject("forbiddenClicks", event);
    }
  };
  const onSubmit = (event) => reject("formSubmissions", event);
  const submit = HTMLFormElement.prototype.submit;
  const requestSubmit = HTMLFormElement.prototype.requestSubmit;
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  HTMLFormElement.prototype.submit = function () {
    reject("formSubmissions");
  };
  HTMLFormElement.prototype.requestSubmit = function () {
    reject("formSubmissions");
  };
  state.disarm = () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("submit", onSubmit, true);
    HTMLFormElement.prototype.submit = submit;
    HTMLFormElement.prototype.requestSubmit = requestSubmit;
    if (window.__careerFormLiveQa === state) delete window.__careerFormLiveQa;
  };
  // The harness's own no-save step move submits through this, so the guard
  // stays armed until the page is replaced.
  state.nativeSubmit = submit;
  state.isForbidden = forbidden;
  window.__careerFormLiveQa = state;
  return true;
}
