import { DETACHED_FIELD_REASON, UNVERIFIED_ATTACH_REASON } from "./attach-file";

export type FillUrlResult =
  | { status: "filled" }
  | { status: "blocked"; reason: string }
  | { status: "unverified"; reason: string };

export const URL_NOT_EDITABLE_REASON = "링크 칸을 입력할 수 없어요.";
export const URL_FILLED_REASON = "링크 칸에 이미 값이 있어요.";

/**
 * Types a stored link into the URL box paired with a file field. Existing
 * values are kept, and the site's own "URL 추가" button is left to the user.
 */
export function fillUrl(input: HTMLInputElement, url: string): FillUrlResult {
  if (!input.isConnected)
    return { status: "blocked", reason: DETACHED_FIELD_REASON };
  if (input.disabled || input.readOnly)
    return { status: "blocked", reason: URL_NOT_EDITABLE_REASON };
  if (input.value.trim())
    return { status: "blocked", reason: URL_FILLED_REASON };

  // Frameworks track the value through the prototype setter.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(input, url);
  else input.value = url;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  return input.value === url
    ? { status: "filled" }
    : { status: "unverified", reason: UNVERIFIED_ATTACH_REASON };
}
