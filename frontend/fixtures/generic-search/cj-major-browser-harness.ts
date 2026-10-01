import { collectFieldsSnapshot } from "../../src/autofill/dom/collect";
import { installCjMajorCloseBridge } from "../../src/autofill/interaction/cj-major-close-bridge";
import {
  CJ_MAJOR_HIDE_SOURCE,
  CJ_MAJOR_SHOW_SOURCE,
  reviewedMethod,
} from "../../src/autofill/interaction/cj-major-close-contract";
import { executeReadonlySearch } from "../../src/autofill/interaction/readonly-search-executor";

/** Synthetic browser + live public endpoint only; NOT installed-extension proof.
 * Bundle this entry as a trusted IIFE and inject it into the disposable HTML fixture
 * after its public jQuery and needPopup scripts load. Never mount on an application.
 */
declare global {
  interface Window {
    __CF110_SYNTHETIC_HARNESS__?: boolean;
    needPopup?: { init: () => void; show: unknown; hide: unknown };
    jQuery?: { fn: { tabkeyListener?: unknown } };
  }
}

const ORIGIN = "https://recruit.cj.net";
const EXPECTED = "컴퓨터공학"; // Public, nonpersonal search term, not a profile value.
// Code observed directly in the public CJ result for this synthetic query.
// Fixture assertion only: never use this hardcoded code in production selection.
const EXPECTED_PUBLIC_CODE = "22WD";
const ROOT = "[data-cf110-synthetic-harness]";

function libraryWrapperOnly(): boolean {
  const wrappers = document.querySelectorAll<HTMLElement>(".popup_wrapper");
  if (wrappers.length > 1) return false;
  if (!wrappers.length) return true; // Before needPopup.init().
  const wrapper = wrappers[0]!;
  if (
    wrapper.parentElement !== document.body ||
    [...wrapper.children].some(
      (child) => !child.matches("#popupIframe2.popup"),
    ) ||
    wrapper.children.length > 1
  )
    return false;
  if (!wrapper.children.length) return true; // After init or audited hide(0).
  const popup = wrapper.firstElementChild!;
  const children = [...popup.children];
  return (
    children.filter((child) => child.matches(".popup_inner")).length === 1 &&
    children.filter((child) => child.matches('a#popup_cls.popup_cls[href="#"]'))
      .length === 1 &&
    children.filter((child) => child.matches("span.tab_span")).length === 2 &&
    children.length === 4 &&
    popup.querySelectorAll(":scope > .popup_inner > iframe").length === 1
  );
}

function fixture(): HTMLElement {
  const root = document.querySelector<HTMLElement>(ROOT);
  const opener = root?.querySelector<HTMLButtonElement>(
    '#sectionNormalUniversity0 dd button[name="bt_mm_major_nm"]',
  );
  if (
    location.origin !== ORIGIN ||
    window.__CF110_SYNTHETIC_HARNESS__ !== true ||
    !root ||
    document.querySelectorAll(ROOT).length !== 1 ||
    document.querySelector("form") ||
    !libraryWrapperOnly() ||
    [...document.body.children].some(
      (child) =>
        child !== root &&
        child.tagName !== "SCRIPT" &&
        !child.matches(".popup_wrapper"),
    ) ||
    document.querySelectorAll("#sectionNormalUniversity0").length !== 1 ||
    document.querySelectorAll("#mm_major_nm2_0").length !== 1 ||
    document.querySelectorAll('input[name="major"]').length !== 1 ||
    root.querySelectorAll('#sectionNormalUniversity0 [name="bt_mm_major_nm"]')
      .length !== 1 ||
    !opener ||
    opener.id ||
    opener.type !== "button" ||
    opener.title !== "전공 검색" ||
    opener.getAttribute("data-popup-show") !== "" ||
    opener.getAttribute("data-iframe-url") !==
      "https://recruit.cj.net/recruit/ko/resume/search/search_major.fo?num=2_0" ||
    [...document.querySelectorAll("input, button")].some(
      (control) => !root.contains(control),
    )
  ) {
    throw new Error(
      "Unsupported document: only the disposable CF-110 fixture at the exact CJ origin is allowed",
    );
  }
  return root;
}

function control<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error("Synthetic fixture control missing");
  return found;
}

const root = fixture();
const target = control<HTMLInputElement>(root, "#mm_major_nm2_0");
const code = control<HTMLInputElement>(
  root,
  'dd input[type="hidden"][name="major"]',
);
const other = control<HTMLInputElement>(root, "#cf110-other-field");
const otherCode = control<HTMLInputElement>(root, "#cf110-other-code");
const otherCheck = control<HTMLInputElement>(root, "#cf110-other-check");
const runButton = control<HTMLButtonElement>(root, "#cf110-run");
const resetButton = control<HTMLButtonElement>(root, "#cf110-reset");
const output = control<HTMLOutputElement>(root, "#cf110-result");
const unrelatedInitial = {
  field: other.value,
  code: otherCode.value,
  checked: otherCheck.checked,
};
let running = false;
let runCount = 0;

function unrelatedPreserved(): boolean {
  return (
    other.value === unrelatedInitial.field &&
    otherCode.value === unrelatedInitial.code &&
    otherCheck.checked === unrelatedInitial.checked
  );
}

function report(fields: Record<string, string | number | boolean>): void {
  output.textContent = JSON.stringify(fields, null, 2);
}

function popupClosed(): boolean {
  return !document.querySelector("#popupIframe2, #popup_cls");
}

async function run(): Promise<void> {
  try {
    fixture();
  } catch {
    report({ status: "unsupported", reason: "not_synthetic_fixture" });
    return;
  }
  if (running || target.value || code.value || !popupClosed()) {
    report({ status: "unsupported", reason: "synthetic_state_not_reset" });
    return;
  }
  running = true;
  runButton.disabled = true;
  resetButton.disabled = true;
  const iteration = ++runCount;
  const startedAt = performance.now();
  let reflectedAndClosedSince: number | undefined;
  const sample = () => {
    if (
      target.value === EXPECTED &&
      code.value === EXPECTED_PUBLIC_CODE &&
      popupClosed()
    ) {
      reflectedAndClosedSince ??= performance.now();
    } else {
      reflectedAndClosedSince = undefined;
    }
  };
  const interval = window.setInterval(sample, 20);
  try {
    const snapshot = collectFieldsSnapshot(document);
    const candidates = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ])
      .filter((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return (
          lookup.status === "blocked" &&
          lookup.reason === "readonly" &&
          lookup.handle.elements[0] === target
        );
      });
    if (candidates.length !== 1) {
      report({
        iteration,
        status: "unsupported",
        reason: "target_registry_ambiguous",
      });
      return;
    }
    // No fake response, callback, bookmark, or application submit. The production
    // executor owns the real same-origin request, inert parsing, setters and close.
    const result = await executeReadonlySearch({
      document,
      registry: snapshot.registry,
      targetCandidateId: candidates[0]!.candidateId,
      canonicalFieldKey: "education.university.majorName",
      expectedValue: EXPECTED,
      expectedCurrentValue: "",
      assertCurrent: () => {
        try {
          return fixture() === root && root.isConnected;
        } catch {
          return false;
        }
      },
    });
    sample();
    // Keep observing the actual display/code and popup postcondition for a
    // further 500ms if the 20ms observer began after the executor's own clock.
    if (result.status === "selected" && reflectedAndClosedSince !== undefined) {
      while (performance.now() - reflectedAndClosedSince < 500) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
        sample();
        if (reflectedAndClosedSince === undefined) break;
      }
    }
    const retainedMs =
      reflectedAndClosedSince === undefined
        ? 0
        : Math.floor(performance.now() - reflectedAndClosedSince);
    const displayMatches = target.value === EXPECTED;
    const codeMatchesPublicFixtureExpectation =
      code.value === EXPECTED_PUBLIC_CODE;
    const closed = popupClosed();
    const preserved = unrelatedPreserved();
    report({
      iteration,
      status: result.status,
      reason: "reason" in result ? result.reason : "none",
      effect: result.effect ?? "none",
      elapsedMs: Math.floor(performance.now() - startedAt),
      retainedMs,
      retainedAtLeast500Ms: retainedMs >= 500,
      executorReportedSelected: result.status === "selected",
      displayMatches,
      codeMatchesPublicFixtureExpectation,
      reflected: displayMatches && codeMatchesPublicFixtureExpectation,
      popupClosed: closed,
      unrelatedPreserved: preserved,
      pass:
        result.status === "selected" &&
        retainedMs >= 500 &&
        displayMatches &&
        codeMatchesPublicFixtureExpectation &&
        closed &&
        preserved,
    });
  } catch {
    // Error text may contain response or page data. Report only a fixed reason.
    report({ iteration, status: "failed", reason: "harness_exception" });
  } finally {
    window.clearInterval(interval);
    running = false;
    resetButton.disabled = !popupClosed();
  }
}

function reset(): void {
  try {
    fixture();
  } catch {
    report({ status: "unsupported", reason: "not_synthetic_fixture" });
    return;
  }
  if (running || !popupClosed()) {
    report({ status: "unsupported", reason: "popup_must_close_before_reset" });
    return;
  }
  // Only synthetic controls under the fixed harness root; no real application reset.
  target.value = "";
  code.value = "";
  report({
    status: "reset",
    readyForRun: true,
    unrelatedPreserved: unrelatedPreserved(),
  });
  runButton.disabled = false;
  resetButton.disabled = true;
}

if (
  typeof window.jQuery?.fn.tabkeyListener !== "function" ||
  typeof window.needPopup?.init !== "function"
) {
  report({
    status: "unsupported",
    reason: "public_popup_dependency_unavailable",
  });
} else if (
  !reviewedMethod(window.needPopup.show, CJ_MAJOR_SHOW_SOURCE) ||
  !reviewedMethod(window.needPopup.hide, CJ_MAJOR_HIDE_SOURCE)
) {
  report({ status: "unsupported", reason: "popup_source_not_reviewed" });
} else {
  try {
    installCjMajorCloseBridge(document);
    window.needPopup.init();
    fixture(); // Accept only the library's empty wrapper after initialization.
    runButton.addEventListener("click", () => {
      void run();
    });
    resetButton.addEventListener("click", reset);
    runButton.disabled = false;
    report({
      status: "ready",
      synthetic: true,
      exactOrigin: true,
      reviewedPublicPopupSource: true,
    });
  } catch {
    report({ status: "unsupported", reason: "popup_initialization_failed" });
  }
}
