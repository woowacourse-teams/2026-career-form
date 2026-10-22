import type { FieldCandidateHandle } from "./types";

export const SPLIT_EMAIL_REASON =
  "이메일 아이디와 도메인이 나뉜 입력칸은 자동 기입을 지원하지 않아요. 각각 직접 입력해 주세요.";

// A domain option may carry the domain as its label or only as its value
// (labels such as "지메일" or a sanitized "[TEXT]" with value="gmail.com").
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const domainOption = (option: HTMLOptionElement): boolean =>
  DOMAIN_PATTERN.test((option.textContent ?? "").trim()) ||
  DOMAIN_PATTERN.test(option.value.trim());

/** Recognize only the local input, literal separator and domain select pair. */
export function isSplitEmailTarget(handle: FieldCandidateHandle): boolean {
  const input = handle.elements[0];
  if (handle.elements.length !== 1 || !(input instanceof HTMLInputElement))
    return false;
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
      return false;
    const between = input.ownerDocument.createRange();
    between.setStartAfter(input);
    between.setEndBefore(select);
    return between.toString().trim() === "@";
  }
  return false;
}
