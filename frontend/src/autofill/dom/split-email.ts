import { isWritableWriteElement } from "./write-target";
import type { FieldCandidateHandle } from "./types";

export const SPLIT_EMAIL_REASON =
  "이메일 도메인을 자동으로 고르지 못했어요. 아이디 칸의 값을 확인하고 도메인은 직접 선택하거나 입력해 주세요.";

// A domain option may carry the domain as its label or only as its value
// (labels such as "지메일" or a sanitized "[TEXT]" with value="gmail.com").
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const domainOption = (option: HTMLOptionElement): boolean =>
  DOMAIN_PATTERN.test((option.textContent ?? "").trim()) ||
  DOMAIN_PATTERN.test(option.value.trim());
// The same direct-input wording the search flows accept
// (interaction/search-direct-input.ts, interaction/readonly-search-executor.ts).
const CUSTOM_ENTRY_LABEL =
  /^(?:직접\s*입력(?:하기)?|manual entry|enter manually)$/i;
const CONTROLS = "input:not([type=hidden]), select, textarea";
const textInput = (element: Element | undefined): element is HTMLInputElement =>
  element instanceof HTMLInputElement && /^(?:text|email)$/.test(element.type);

export interface SplitEmailControls {
  input: HTMLInputElement;
  select: HTMLSelectElement;
  /** The group holding the pair; a custom domain input appears inside it. */
  group: Element;
  /** A domain text input already in the group (visible or not). */
  domainInput?: HTMLInputElement;
}

/** Recognize only the local input, literal separator and domain select pair. */
export function isSplitEmailTarget(handle: FieldCandidateHandle): boolean {
  return splitEmailControls(handle) !== undefined;
}

/**
 * The pair is the local input, a literal "@", and a domain select in the
 * nearest group holding more than one control. That group may hold one more
 * text input for a domain the select does not list.
 */
export function splitEmailControls(
  handle: FieldCandidateHandle,
): SplitEmailControls | undefined {
  const input = handle.elements[0];
  if (handle.elements.length !== 1 || !(input instanceof HTMLInputElement))
    return undefined;
  for (
    let group = input.parentElement;
    group && !group.matches("body, form");
    group = group.parentElement
  ) {
    const controls = [...group.querySelectorAll(CONTROLS)];
    if (controls.length < 2) continue;
    if (controls.length > 3 || controls[0] !== input) return undefined;
    const rest = controls.slice(1);
    const selects = rest.filter(
      (control) => control instanceof HTMLSelectElement,
    );
    const select = selects[0];
    const domainInput = rest.find((control) => control !== select);
    if (
      selects.length !== 1 ||
      !(select instanceof HTMLSelectElement) ||
      (domainInput !== undefined && !textInput(domainInput)) ||
      ![...select.options].some(domainOption)
    )
      return undefined;
    const between = input.ownerDocument.createRange();
    between.setStartAfter(input);
    between.setEndBefore(controls[1]!);
    return between.toString().trim() === "@"
      ? { input, select, group, ...(domainInput ? { domainInput } : {}) }
      : undefined;
  }
  return undefined;
}

/**
 * True for the domain select or domain input of a recognized pair. They are
 * written with the pair, never as separate items.
 */
export function isSplitEmailMember(element: Element): boolean {
  for (
    let group = element.parentElement;
    group && !group.matches("body, form");
    group = group.parentElement
  ) {
    const first = group.querySelector(CONTROLS);
    if (!(first instanceof HTMLInputElement) || first === element) continue;
    const controls = splitEmailControls({
      elements: [first],
    } as unknown as FieldCandidateHandle);
    if (controls)
      return controls.select === element || controls.domainInput === element;
  }
  return false;
}

/** Split one address into its local part and domain; anything else is not split. */
export function splitEmailAddress(
  email: string,
): { local: string; domain: string } | undefined {
  const parts = email.trim().split("@");
  return parts.length === 2 && parts[0] && DOMAIN_PATTERN.test(parts[1]!)
    ? { local: parts[0], domain: parts[1]!.toLowerCase() }
    : undefined;
}

/** The single enabled option whose label or value is exactly the domain. */
export function splitEmailDomainOption(
  select: HTMLSelectElement,
  domain: string,
): HTMLOptionElement | undefined {
  const matches = [...select.options].filter(
    (option) =>
      !option.disabled &&
      ((option.textContent ?? "").trim().toLowerCase() === domain ||
        option.value.trim().toLowerCase() === domain),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** The single enabled, non-domain option labelled as direct entry. */
export function splitEmailCustomOption(
  select: HTMLSelectElement,
): HTMLOptionElement | undefined {
  const matches = [...select.options].filter(
    (option) =>
      !option.disabled &&
      !domainOption(option) &&
      CUSTOM_ENTRY_LABEL.test(
        (option.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * "written": local part and domain are both in place. "partial": only the
 * local part was written and the domain is left to the applicant.
 */
export type SplitEmailWrite =
  "written" | "partial" | "conflict" | "unsupported" | "failed";

const writableDomainInputs = (controls: SplitEmailControls) =>
  [...controls.group.querySelectorAll("input")].filter(
    (element) =>
      element !== controls.input &&
      textInput(element) &&
      isWritableWriteElement(element),
  );

/**
 * Write the local part and the domain. The domain is an exact option or, when
 * no option lists it, the single direct-entry option plus the one text input
 * that choice makes writable. Otherwise only the local part is written. A
 * different existing local part or chosen domain is a conflict and nothing is
 * changed.
 */
export function writeSplitEmail(
  handle: FieldCandidateHandle,
  email: string,
): SplitEmailWrite {
  const controls = splitEmailControls(handle);
  const address = splitEmailAddress(email);
  if (
    !controls ||
    !address ||
    controls.input.readOnly ||
    controls.input.disabled
  )
    return "unsupported";
  const { input, select } = controls;
  const option = splitEmailDomainOption(select, address.domain);
  const custom = option ? undefined : splitEmailCustomOption(select);
  const selected = select.selectedOptions[0];
  if (
    (input.value !== "" && input.value !== address.local) ||
    (selected && selected.value !== "" && selected !== (option ?? custom))
  )
    return "conflict";
  const view = input.ownerDocument.defaultView;
  const inputSetter =
    view &&
    Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")
      ?.set;
  const selectSetter =
    view &&
    Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype, "value")
      ?.set;
  if (!view || !inputSetter || !selectSetter) return "failed";
  const set = (
    element: HTMLInputElement | HTMLSelectElement,
    value: string,
  ) => {
    (element instanceof HTMLSelectElement ? selectSetter : inputSetter).call(
      element,
      value,
    );
    element.dispatchEvent(new view.Event("input", { bubbles: true }));
    element.dispatchEvent(new view.Event("change", { bubbles: true }));
  };
  set(input, address.local);
  const partial = (): SplitEmailWrite =>
    input.value === address.local ? "partial" : "failed";
  if (select.disabled || (!option && !custom)) return partial();
  if (option) {
    set(select, option.value);
    return splitEmailRetained(handle, email) ? "written" : "failed";
  }
  // Direct entry: the domain goes only into the one input this choice makes
  // writable inside the pair's group; any doubt restores the select.
  const before = new Set(
    selected === custom ? [] : writableDomainInputs(controls),
  );
  const previous = select.value;
  if (selected !== custom) set(select, custom!.value);
  const revealed = writableDomainInputs(controls).filter(
    (element) => !before.has(element),
  );
  const target = revealed.length === 1 ? revealed[0]! : undefined;
  if (!target || (target.value !== "" && target.value !== address.domain)) {
    if (select.value !== previous) set(select, previous);
    return partial();
  }
  set(target, address.domain);
  return splitEmailRetained(handle, email) ? "written" : "failed";
}

/** Read back the local part and the domain from the option or direct-entry input. */
export function splitEmailRetained(
  handle: FieldCandidateHandle,
  email: string,
): boolean {
  const controls = splitEmailControls(handle);
  const address = splitEmailAddress(email);
  if (!controls || !address || controls.input.value !== address.local)
    return false;
  const chosen = controls.select.selectedOptions[0];
  const option = splitEmailDomainOption(controls.select, address.domain);
  if (option) return chosen === option;
  return (
    chosen !== undefined &&
    chosen === splitEmailCustomOption(controls.select) &&
    controls.domainInput !== undefined &&
    isWritableWriteElement(controls.domainInput) &&
    controls.domainInput.value === address.domain
  );
}
