import type {
  AnalysisStatus,
  BoundaryAnalysis,
  ControlAnalysis,
  PageAnalysis,
} from './types';

const SUPPORTED_ARIA_ROLES = ['combobox', 'listbox', 'textbox', 'checkbox', 'radio'] as const;
const CONTROL_SELECTOR = [
  'input', 'textarea', 'select', '[contenteditable]',
  ...SUPPORTED_ARIA_ROLES.map((role) => `[role="${role}"]`),
].join(', ');
const SENSITIVE_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code']);
const ACTION_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

interface TraversalContext {
  frameDepth: number;
  shadowDepth: number;
}

export function analyzePage(root: Document): PageAnalysis {
  const controls: ControlAnalysis[] = [];
  const boundaries: BoundaryAnalysis[] = [];

  visitRoot(root, { frameDepth: 0, shadowDepth: 0 }, controls, boundaries);

  return { controls, boundaries };
}

function visitRoot(
  root: Document | ShadowRoot,
  context: TraversalContext,
  controls: ControlAnalysis[],
  boundaries: BoundaryAnalysis[],
): void {
  for (const element of root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
    if (isInaccessibleCustomElement(element)) continue;
    controls.push(classifyControl(element, context));
  }

  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    visitElementBoundary(element, context, controls, boundaries);
  }
}

function visitElementBoundary(
  element: HTMLElement,
  context: TraversalContext,
  controls: ControlAnalysis[],
  boundaries: BoundaryAnalysis[],
): void {
  if (element.shadowRoot !== null) {
    visitRoot(
      element.shadowRoot,
      { ...context, shadowDepth: context.shadowDepth + 1 },
      controls,
      boundaries,
    );
    return;
  }

  if (element.localName === 'iframe') {
    visitFrame(element as HTMLIFrameElement, context, controls, boundaries);
    return;
  }

  if (isInaccessibleCustomElement(element)) {
    controls.push({
      element: element.localName,
      control: roleOf(element) ?? 'custom',
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
  visitRoot(document, frameContext, controls, boundaries);
}

function classifyControl(element: HTMLElement, context: TraversalContext): ControlAnalysis {
  const reasons = failureReasons(element);
  const status = statusFor(element, reasons);

  return {
    element: element.localName,
    control: controlType(element),
    status,
    reasons,
    required: isRequired(element),
    ...context,
  };
}

function failureReasons(element: HTMLElement): string[] {
  const reasons: string[] = [];
  if (isHidden(element)) reasons.push('hidden');
  if (isDisabled(element)) reasons.push('disabled');
  if (isSensitive(element)) reasons.push('sensitive');
  if (isActionControl(element)) reasons.push('action-control');
  if (isInput(element) && element.type === 'file') reasons.push('file-control');
  return reasons;
}

function statusFor(element: HTMLElement, reasons: string[]): AnalysisStatus {
  if (reasons.length > 0) return 'unsupported';
  if (roleOf(element) !== null && !isNativeControl(element)) return 'review-required';
  return 'supported';
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
