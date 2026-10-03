import type { FieldCandidateHandle } from "./types";

export const SPLIT_EMAIL_REASON =
  "이메일 아이디와 도메인이 나뉜 입력칸은 자동 기입을 지원하지 않아요. 각각 직접 입력해 주세요.";

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
      ![...select.options].some((option) =>
        /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(
          (option.textContent ?? "").trim(),
        ),
      )
    )
      return false;
    const between = input.ownerDocument.createRange();
    between.setStartAfter(input);
    between.setEndBefore(select);
    return between.toString().trim() === "@";
  }
  return false;
}
