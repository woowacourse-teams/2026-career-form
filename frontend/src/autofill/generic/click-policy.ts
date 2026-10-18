import { FORBIDDEN_LABEL } from "../dom/generic-form-groups";

// Duplicated from dom/collect.ts (not exported there) so this policy does not
// modify collect.ts. Keep in sync until the constants are shared.
const FORBIDDEN_ACTION =
  /저장|제출|지원|완료|다음|이전|이동|미리보기|삭제|업로드|계산기|submit|save|next|previous|preview|delete|upload|remove|calculator/i;
const GENERIC_PREPARATION_FORBIDDEN_ACTION =
  /초기화|재설정|reset|clear|검색|조회|찾기|search|find|lookup/i;
const STRUCTURAL_CLICK_FORBIDDEN_ACTION =
  /임시\s*저장|미리\s*보기|로그아웃|취소|닫기|logout|log out|sign out|cancel|close/i;
// Patterns that still block a bare close label. STRUCTURAL_CLICK_FORBIDDEN_ACTION
// is left out on purpose: it names 닫기/close, so it would reject every bare
// close label.
const CLOSE_LABEL_BLOCKING_PATTERNS = [
  FORBIDDEN_LABEL,
  FORBIDDEN_ACTION,
  GENERIC_PREPARATION_FORBIDDEN_ACTION,
];
const FORBIDDEN_LABELS = [
  ...CLOSE_LABEL_BLOCKING_PATTERNS,
  STRUCTURAL_CLICK_FORBIDDEN_ACTION,
];

const BARE_CLOSE_LABEL = /^(닫기|close|[x×✕])$/i;
const SUBMIT_INPUT_TYPES = new Set(["submit", "reset", "image"]);
const NON_NAVIGATING_HREF = /^(#|javascript:\s*void\s*\(\s*0\s*\)\s*;?)$/i;

export type ClickBlockReason =
  | "outside-scope"
  | "hidden"
  | "disabled"
  | "submit-input"
  | "implicit-submit-button"
  | "navigating-link"
  | "new-window-target"
  | "form-override-attribute"
  | "forbidden-label";

export type ClickDecision =
  { allowed: true } | { allowed: false; reason: ClickBlockReason };

export function isSafeStructuralClick(
  element: Element,
  scope: Element,
): ClickDecision {
  const reason = blockReason(element, scope);
  return reason ? { allowed: false, reason } : { allowed: true };
}

/**
 * Whether an element in a search surface the extension opened may be clicked
 * to close it. Same structural checks as isSafeStructuralClick, but the label
 * must be a bare close label and must not name any other forbidden action.
 */
export function isSafeSurfaceCloseClick(
  element: Element,
  scope: Element,
): ClickDecision {
  const reason = blockReason(element, scope, true);
  return reason ? { allowed: false, reason } : { allowed: true };
}

function blockReason(
  element: Element,
  scope: Element,
  closeOnly = false,
): ClickBlockReason | undefined {
  if (!scope.contains(element)) return "outside-scope";
  if (isInvisible(element)) return "hidden";
  if (element.hasAttribute("disabled") || element.matches(":disabled"))
    return "disabled";
  if (
    element instanceof HTMLInputElement &&
    SUBMIT_INPUT_TYPES.has(element.type)
  )
    return "submit-input";
  if (
    element instanceof HTMLButtonElement &&
    element.closest("form") &&
    element.getAttribute("type")?.trim().toLowerCase() !== "button"
  )
    return "implicit-submit-button";
  const href = element.matches("a[href]")
    ? element.getAttribute("href")!.trim()
    : undefined;
  if (href !== undefined && !NON_NAVIGATING_HREF.test(href))
    return "navigating-link";
  if (element.getAttribute("target")?.trim().toLowerCase() === "_blank")
    return "new-window-target";
  if (element.hasAttribute("formaction") || element.hasAttribute("form"))
    return "form-override-attribute";
  const label = labelOf(element);
  if (closeOnly) {
    return BARE_CLOSE_LABEL.test(label) &&
      !CLOSE_LABEL_BLOCKING_PATTERNS.some((pattern) => pattern.test(label))
      ? undefined
      : "forbidden-label";
  }
  if (isForbiddenClickLabel(label)) return "forbidden-label";
  return undefined;
}

/** Whether text names an action that a structural click must never take. */
export function isForbiddenClickLabel(text: string): boolean {
  return FORBIDDEN_LABELS.some((pattern) => pattern.test(text));
}

function isInvisible(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true' i], [inert]")) return true;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  if (view.getComputedStyle(element).visibility === "hidden") return true;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (view.getComputedStyle(current).display === "none") return true;
  }
  return false;
}

function labelOf(element: Element): string {
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element instanceof HTMLInputElement ? element.value : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
