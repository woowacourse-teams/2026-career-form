import { SearchFailure } from "./search-session";

export interface SearchFollowUpObservation {
  wait(args: {
    signal?: AbortSignal;
    assertCurrent?: () => boolean;
    verify?: () => void;
  }): Promise<readonly SearchFollowUpControl[]>;
  dispose(): void;
}

export type SearchFollowUpControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const CONTROL_SELECTOR = "input, select, textarea";
const MINIMUM_SETTLE_MS = 500;

function controls(scope: Element): SearchFollowUpControl[] {
  return Array.from(
    scope.querySelectorAll<SearchFollowUpControl>(CONTROL_SELECTOR),
  ).filter(
    (control) =>
      !(control instanceof HTMLInputElement && control.type === "hidden"),
  );
}

function visible(control: SearchFollowUpControl): boolean {
  for (
    let ancestor: Element | null = control;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (
      ancestor.hasAttribute("hidden") ||
      ancestor.hasAttribute("inert") ||
      ancestor.getAttribute("aria-hidden") === "true" ||
      ancestor.getAttribute("aria-busy") === "true" ||
      ancestor.getAttribute("data-loading") === "true"
    )
      return false;
    const style = control.ownerDocument.defaultView?.getComputedStyle(ancestor);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.contentVisibility === "hidden" ||
      style?.opacity === "0"
    )
      return false;
  }
  return true;
}

function state(control: SearchFollowUpControl): string {
  if (control instanceof HTMLSelectElement)
    return JSON.stringify([
      visible(control),
      control.disabled,
      control.value,
      control.getAttribute("aria-busy"),
      Array.from(control.options, (option) => [
        option.value,
        option.text,
        option.disabled,
      ]),
    ]);
  return JSON.stringify([
    visible(control),
    control.disabled,
    control instanceof HTMLInputElement ? control.type : "textarea",
    control.readOnly,
  ]);
}

function ready(control: SearchFollowUpControl): boolean {
  if (control.disabled || !visible(control)) return false;
  if (control instanceof HTMLInputElement && control.type === "hidden")
    return false;
  if (!(control instanceof HTMLSelectElement)) return true;
  return Array.from(control.options).some(
    (option) => !option.disabled && option.value.trim(),
  );
}

/** Local pre-click baseline; readiness also requires a subsequent structural change. */
export function captureSearchFollowUp(
  scope: Element,
  target: HTMLInputElement,
): SearchFollowUpObservation | undefined {
  if (!scope.isConnected || !scope.contains(target)) return undefined;
  const parent = scope.parentElement;
  const baseline = new Map(
    controls(scope).map((control) => [control, state(control)]),
  );
  const expected = [...baseline.keys()].filter(
    (control) => control instanceof HTMLSelectElement && !ready(control),
  );
  let disposed = false;
  let userChanged = false;
  const onInput = (event: Event) => {
    if (event.isTrusted) userChanged = true;
  };
  const dispose = () => {
    disposed = true;
    scope.removeEventListener("input", onInput, true);
    scope.removeEventListener("change", onInput, true);
  };
  return {
    dispose,
    async wait({ signal, assertCurrent, verify }) {
      scope.addEventListener("input", onInput, true);
      scope.addEventListener("change", onInput, true);
      const start = Date.now();
      let stableSince = start;
      let last = "";
      try {
        while (Date.now() - start < 1500) {
          if (signal?.aborted) throw new SearchFailure("aborted");
          if (
            disposed ||
            userChanged ||
            assertCurrent?.() === false ||
            !scope.isConnected ||
            scope.parentElement !== parent ||
            !scope.contains(target)
          )
            throw new SearchFailure("selection_postcondition_failed");
          verify?.();
          const currentControls = controls(scope);
          if ([...baseline.keys()].some((control) => !scope.contains(control)))
            throw new SearchFailure("selection_postcondition_failed");
          const changed = currentControls.filter(
            (control) => baseline.get(control) !== state(control),
          );
          const signature = JSON.stringify(currentControls.map(state));
          if (signature !== last) {
            last = signature;
            stableSince = Date.now();
          }
          if (
            changed.length &&
            changed.every(ready) &&
            expected.every(
              (control) => changed.includes(control) && ready(control),
            ) &&
            Date.now() - stableSince >= MINIMUM_SETTLE_MS
          )
            return changed;
          if (
            !changed.length &&
            !expected.length &&
            Date.now() - start >= MINIMUM_SETTLE_MS
          )
            return [];
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
        if (
          expected.length ||
          controls(scope).some(
            (control) => baseline.get(control) !== state(control),
          )
        )
          throw new SearchFailure("result_pending");
        return [];
      } finally {
        dispose();
      }
    },
  };
}
