import type { FieldCandidateHandle } from "./types";

export const SPLIT_EMAIL_REASON =
  "이메일 도메인 선택지에서 프로필 이메일의 도메인을 찾지 못했어요. 아이디와 도메인을 직접 입력해 주세요.";

// A domain option may carry the domain as its label or only as its value
// (labels such as "지메일" or a sanitized "[TEXT]" with value="gmail.com").
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const domainOption = (option: HTMLOptionElement): boolean =>
  DOMAIN_PATTERN.test((option.textContent ?? "").trim()) ||
  DOMAIN_PATTERN.test(option.value.trim());

/** Recognize only the local input, literal separator and domain select pair. */
export function isSplitEmailTarget(handle: FieldCandidateHandle): boolean {
  return splitEmailControls(handle) !== undefined;
}

export function splitEmailControls(
  handle: FieldCandidateHandle,
): { input: HTMLInputElement; select: HTMLSelectElement } | undefined {
  const input = handle.elements[0];
  if (handle.elements.length !== 1 || !(input instanceof HTMLInputElement))
    return undefined;
  for (
    let group = input.parentElement;
    group && !group.matches("body, form");
    group = group.parentElement
  ) {
    const controls = [
      ...group.querySelectorAll("input:not([type=hidden]), select, textarea"),
    ];
    if (controls.length < 2) continue;
    const select = controls[1];
    if (
      controls.length !== 2 ||
      controls[0] !== input ||
      !(select instanceof HTMLSelectElement) ||
      ![...select.options].some(domainOption)
    )
      return undefined;
    const between = input.ownerDocument.createRange();
    between.setStartAfter(input);
    between.setEndBefore(select);
    return between.toString().trim() === "@" ? { input, select } : undefined;
  }
  return undefined;
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

/** True when the split pair can take this address without guessing. */
export function canWriteSplitEmail(
  handle: FieldCandidateHandle,
  email: string,
): boolean {
  const controls = splitEmailControls(handle);
  const address = splitEmailAddress(email);
  return Boolean(
    controls && address && splitEmailDomainOption(controls.select, address.domain),
  );
}

export type SplitEmailWrite = "written" | "conflict" | "unsupported" | "failed";

/**
 * Write the local part and select the domain. A different existing local part
 * or a different selected domain is a conflict and nothing is changed.
 */
export function writeSplitEmail(
  handle: FieldCandidateHandle,
  email: string,
): SplitEmailWrite {
  const controls = splitEmailControls(handle);
  const address = splitEmailAddress(email);
  const option =
    controls && address
      ? splitEmailDomainOption(controls.select, address.domain)
      : undefined;
  if (!controls || !address || !option || controls.input.readOnly || controls.select.disabled)
    return "unsupported";
  const { input, select } = controls;
  const selected = select.selectedOptions[0];
  if (
    (input.value !== "" && input.value !== address.local) ||
    (selected && selected.value !== "" && selected !== option)
  )
    return "conflict";
  const view = input.ownerDocument.defaultView;
  const inputSetter = view && Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
  const selectSetter = view && Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype, "value")?.set;
  if (!view || !inputSetter || !selectSetter) return "failed";
  inputSetter.call(input, address.local);
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
  input.dispatchEvent(new view.Event("change", { bubbles: true }));
  selectSetter.call(select, option.value);
  select.dispatchEvent(new view.Event("input", { bubbles: true }));
  select.dispatchEvent(new view.Event("change", { bubbles: true }));
  return splitEmailRetained(handle, email) ? "written" : "failed";
}

export function splitEmailRetained(
  handle: FieldCandidateHandle,
  email: string,
): boolean {
  const controls = splitEmailControls(handle);
  const address = splitEmailAddress(email);
  if (!controls || !address) return false;
  const option = splitEmailDomainOption(controls.select, address.domain);
  return (
    controls.input.value === address.local &&
    option !== undefined &&
    controls.select.selectedOptions[0] === option
  );
}
