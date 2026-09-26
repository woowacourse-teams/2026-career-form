import { normalized, type TargetIdentity } from "./readonly-search";
import { SearchFailure } from "./search-session";

const CONTROL_SELECTOR = "input, select, textarea";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type ControlSnapshot = {
  element: FormControl;
  state: string;
  availabilityState?: string;
};

export interface SelectionEffectBinding {
  scope: Element;
  target: HTMLInputElement;
  expectedNames: readonly string[];
  relation: { element: HTMLInputElement; expectedValue: string };
  peers: readonly ControlSnapshot[];
  externalPeers: readonly ControlSnapshot[];
}

function controlState(
  control: FormControl,
  ignoreAvailability = false,
): string {
  return JSON.stringify({
    value: control.value,
    ...(!ignoreAvailability
      ? {
          disabled: control.disabled,
          ...(control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement
            ? { readOnly: control.readOnly }
            : {}),
        }
      : {}),
    ...(control instanceof HTMLInputElement
      ? {
          checked: control.checked,
          type: control.type,
        }
      : control instanceof HTMLTextAreaElement
        ? {}
        : { selectedIndex: control.selectedIndex }),
  });
}

function peerSnapshot(element: FormControl, sameRow: boolean): ControlSnapshot {
  const allowAvailability =
    sameRow &&
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
    !normalized(element.value) &&
    (element.disabled || element.readOnly);
  return {
    element,
    state: controlState(element),
    ...(allowAvailability
      ? { availabilityState: controlState(element, true) }
      : {}),
  };
}

function controls(scope: Element): FormControl[] {
  return Array.from(scope.querySelectorAll<FormControl>(CONTROL_SELECTOR));
}

function dormantFollowUp(control: FormControl): boolean {
  // A blank same-row select is a site-controlled follow-up, even if its
  // choices have already been rendered. Its options and availability may
  // legitimately change as a result of choosing the search result. A value
  // chosen before the click remains an immutable peer.
  return control instanceof HTMLSelectElement && !normalized(control.value);
}

function explicitRelationValue(candidate: HTMLElement): string | undefined {
  const values = [
    candidate.getAttribute("data-code"),
    candidate.getAttribute("data-value-code"),
    candidate.getAttribute("data-result-id"),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : undefined;
}

function relationControl(
  scope: Element,
  target: HTMLInputElement,
  candidate: HTMLElement,
): HTMLInputElement | undefined {
  const hidden = controls(scope).filter(
    (control): control is HTMLInputElement =>
      control.tagName === "INPUT" &&
      (control as HTMLInputElement).type === "hidden" &&
      control !== target,
  );
  if (!hidden.length) return undefined;
  const relationTarget =
    candidate.getAttribute("data-code-target") ??
    candidate.getAttribute("data-result-target");
  if (relationTarget) {
    const matches = hidden.filter(
      (control) =>
        control.id === relationTarget || control.name === relationTarget,
    );
    if (matches.length === 1) return matches[0];
    throw new SearchFailure("selection_effect_unverified");
  }
  if (hidden.length === 1) return hidden[0];
  throw new SearchFailure("selection_effect_unverified");
}

export function bindSelectionEffects(
  identity: TargetIdentity,
  candidate: HTMLElement,
  expectedNames: readonly string[],
): SelectionEffectBinding {
  const scope = identity.repeatRow ?? identity.fieldGroup;
  if (!scope.isConnected || !scope.contains(identity.target)) {
    throw new SearchFailure("selection_effect_unverified");
  }
  const relation = relationControl(scope, identity.target, candidate);
  const relationValue = relation ? explicitRelationValue(candidate) : undefined;
  if (!relation || relationValue === undefined) {
    throw new SearchFailure("selection_effect_unverified");
  }
  const peers = controls(scope)
    .filter(
      (control) =>
        control !== identity.target &&
        control !== relation &&
        !dormantFollowUp(control),
    )
    .map((element) => peerSnapshot(element, true));
  const externalContainer =
    identity.target.form ?? identity.repeatRow?.parentElement;
  const externalPeers = externalContainer
    ? controls(externalContainer)
        .filter((control) => !scope.contains(control))
        .map((element) => peerSnapshot(element, false))
    : [];
  return {
    scope,
    target: identity.target,
    expectedNames,
    relation: { element: relation, expectedValue: relationValue },
    peers,
    externalPeers,
  };
}

export function verifySelectionEffects(binding: SelectionEffectBinding): void {
  if (
    !binding.scope.isConnected ||
    !binding.target.isConnected ||
    !binding.scope.contains(binding.target) ||
    !binding.expectedNames.some(
      (value) => normalized(value) === normalized(binding.target.value),
    ) ||
    !binding.relation.element.isConnected ||
    !binding.scope.contains(binding.relation.element) ||
    binding.relation.element.value !== binding.relation.expectedValue ||
    binding.peers.some(
      ({ element, state, availabilityState }) =>
        !element.isConnected ||
        !binding.scope.contains(element) ||
        controlState(element, availabilityState !== undefined) !==
          (availabilityState ?? state),
    ) ||
    binding.externalPeers.some(
      ({ element, state, availabilityState }) =>
        !element.isConnected ||
        controlState(element, availabilityState !== undefined) !==
          (availabilityState ?? state),
    )
  ) {
    throw new SearchFailure("selection_postcondition_failed");
  }
}
