import {
  acceptMismatchReason,
  acceptsFile,
  fieldBlockReason,
} from "./file-fields";

export type AttachFileResult =
  | { status: "attached" }
  | { status: "blocked"; reason: string }
  | { status: "unverified"; reason: string };

export const DETACHED_FIELD_REASON =
  "칸이 화면에서 사라졌어요. 다시 실행해 주세요.";
export const UNVERIFIED_ATTACH_REASON =
  "첨부했는지 확인하지 못했어요. 지원서 화면에서 직접 확인해 주세요.";

/**
 * Puts one profile file into a confirmed file input. The field is rechecked
 * first because the page may have changed since the user reviewed it, and an
 * existing file is never replaced.
 */
export function attachFile(
  input: HTMLInputElement,
  file: File,
): AttachFileResult {
  if (!input.isConnected)
    return { status: "blocked", reason: DETACHED_FIELD_REASON };
  const blocked = fieldBlockReason(input);
  if (blocked) return { status: "blocked", reason: blocked };
  if (!acceptsFile(input, file))
    return { status: "blocked", reason: acceptMismatchReason(file.type) };

  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  const attached = input.files?.[0];
  return attached?.name === file.name && attached.size === file.size
    ? { status: "attached" }
    : { status: "unverified", reason: UNVERIFIED_ATTACH_REASON };
}
