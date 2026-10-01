import type {
  ActionAnalysis,
  AnalysisStatus,
  BoundaryAnalysis,
  ControlAnalysis,
  PageAnalysis,
} from './types';
import { controlIdentifiers, inferAction, inferFieldSemantics } from './infer-semantics';

const SUPPORTED_ARIA_ROLES = ['combobox', 'listbox', 'textbox', 'checkbox', 'radio'] as const;
const CONTROL_SELECTOR = [
  'input', 'textarea', 'select', '[contenteditable]',
  ...SUPPORTED_ARIA_ROLES.map((role) => `[role="${role}"]`),
].join(', ');
const SENSITIVE_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code']);
const ACTION_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);
const ACTION_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';

interface TraversalContext {
  frameDepth: number;
  shadowDepth: number;
}

export function analyzePage(root: Document): PageAnalysis {
  const controls: ControlAnalysis[] = [];
  const actions: ActionAnalysis[] = [];
  const boundaries: BoundaryAnalysis[] = [];

  visitRoot(root, { frameDepth: 0, shadowDepth: 0 }, controls, actions, boundaries);

  return { controls, actions, boundaries };
}

function visitRoot(
  root: Document | ShadowRoot,
  context: TraversalContext,
  controls: ControlAnalysis[],
  actions: ActionAnalysis[],
  boundaries: BoundaryAnalysis[],
): void {
  for (const element of root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
    if (isInaccessibleCustomElement(element)) continue;
    controls.push(classifyControl(element, context));
  }

  for (const element of root.querySelectorAll<HTMLElement>(ACTION_SELECTOR)) {
    actions.push(inferAction(element, visibilityOf(element)));
  }

  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    visitElementBoundary(element, context, controls, actions, boundaries);
  }
}

function visitElementBoundary(
  element: HTMLElement,
  context: TraversalContext,
  controls: ControlAnalysis[],
  actions: ActionAnalysis[],
  boundaries: BoundaryAnalysis[],
): void {
  if (element.shadowRoot !== null) {
    visitRoot(
      element.shadowRoot,
      { ...context, shadowDepth: context.shadowDepth + 1 },
      controls, actions,
      boundaries,
    );
    return;
  }

  if (element.localName === 'iframe') {
    visitFrame(element as HTMLIFrameElement, context, controls, actions, boundaries);
    return;
  }

  if (isInaccessibleCustomElement(element)) {
    controls.push({
      element: element.localName,
      control: roleOf(element) ?? 'custom',
      ...controlIdentifiers(element),
      profileField: 'unknown',
      section: 'unknown',
      confidence: 'unknown',
      visibility: visibilityOf(element),
      status: 'review-required',
      reasons: ['inaccessible-custom-element'],
      required: element.getAttribute('aria-required') === 'true',
      ...context,
    });
  }
}

function isInaccessibleCustomElement(element: HTMLElement): boolean {
  return element.localName.includes('-') && element.shadowRoot === null;
}

function visitFrame(
  frame: HTMLIFrameElement,
  context: TraversalContext,
  controls: ControlAnalysis[],
  actions: ActionAnalysis[],
  boundaries: BoundaryAnalysis[],
): void {
  const frameContext = { ...context, frameDepth: context.frameDepth + 1 };
  let document: Document | null = null;
  try {
    document = frame.contentDocument;
  } catch {
    document = null;
  }
  if (document === null) {
    boundaries.push({
      kind: 'iframe',
      reason: 'inaccessible-frame',
      ...frameContext,
    });
    return;
  }
  visitRoot(document, frameContext, controls, actions, boundaries);
}

function classifyControl(element: HTMLElement, context: TraversalContext): ControlAnalysis {
  const reasons = failureReasons(element);
  const status = statusFor(element, reasons);
  const semantics = inferFieldSemantics(element);
  const identifiers = controlIdentifiers(element);

  return {
    element: element.localName,
    control: controlType(element),
    ...identifiers,
    ...semantics,
    visibility: visibilityOf(element),
    status,
    reasons,
    required: isRequired(element),
    ...context,
  };
}

function failureReasons(element: HTMLElement): string[] {
  const reasons: string[] = [];
  if (isHidden(element)) reasons.push('hidden');
  if (isInput(element) && element.type === 'hidden') reasons.push('hidden-input');
  if (isDisabled(element)) reasons.push('disabled');
  if (isSensitive(element)) reasons.push('sensitive');
  if (isActionControl(element)) reasons.push('action-control');
  if (isInput(element) && element.type === 'file') reasons.push('file-control');
  return reasons;
}

function statusFor(element: HTMLElement, reasons: string[]): AnalysisStatus {
  if (reasons.some((reason) => reason !== 'hidden')) return 'unsupported';
  if (roleOf(element) !== null && !isNativeControl(element)) return 'review-required';
  return 'supported';
}

function visibilityOf(element: HTMLElement): 'visible' | 'hidden' {
  return isHidden(element) ? 'hidden' : 'visible';
}

function controlType(element: HTMLElement): string {
  if (isInput(element)) return element.type;
  if (isTextarea(element)) return 'textarea';
  if (isSelect(element)) return 'select';
  if (element.isContentEditable) return 'contenteditable';
  return roleOf(element) ?? 'unknown';
}

function roleOf(element: HTMLElement): string | null {
  return element.getAttribute('role')?.toLowerCase() ?? null;
}

function isNativeControl(element: HTMLElement): boolean {
  return isInput(element) || isTextarea(element) || isSelect(element);
}

function isHidden(element: HTMLElement): boolean {
  if (isInput(element) && element.type === 'hidden') return true;
  const view = element.ownerDocument.defaultView;
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
    if (view !== null) {
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    current = current.parentElement;
  }
  return false;
}

function isDisabled(element: HTMLElement): boolean {
  return (isInput(element) || isTextarea(element) || isSelect(element))
    ? element.matches(':disabled')
    : element.getAttribute('aria-disabled') === 'true';
}

function isSensitive(element: HTMLElement): boolean {
  if (!isInput(element)) return false;
  return element.type === 'password' || SENSITIVE_AUTOCOMPLETE.has(element.autocomplete);
}

function isActionControl(element: HTMLElement): boolean {
  return isInput(element) && ACTION_INPUT_TYPES.has(element.type);
}

function isRequired(element: HTMLElement): boolean {
  if (isInput(element) || isTextarea(element) || isSelect(element)) {
    return element.required;
  }
  return element.getAttribute('aria-required') === 'true';
}

function isInput(element: HTMLElement): element is HTMLInputElement {
  return element.localName === 'input';
}

function isTextarea(element: HTMLElement): element is HTMLTextAreaElement {
  return element.localName === 'textarea';
}

function isSelect(element: HTMLElement): element is HTMLSelectElement {
  return element.localName === 'select';
}
