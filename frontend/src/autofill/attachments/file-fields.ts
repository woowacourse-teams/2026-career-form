import {
  attachmentTypeLabel,
  JPEG_TYPE,
  PDF_TYPE,
  PNG_TYPE,
  type AttachmentKind,
} from "../../attachments/model";
import { labelOf } from "../dom/metadata";
import { isVisibleWriteElement } from "../dom/write-target";

export interface AttachmentField {
  element: HTMLInputElement;
  label: string;
  /** Set only when the field is confirmed to ask for one kind of profile file. */
  kind?: AttachmentKind;
  /** Why the field cannot receive a profile file right now. */
  blockedReason?: string;
  /** Text of the field's own group, used to suggest an evidence entry. */
  context: string;
  /** A URL box offered beside the file input for the same document. */
  urlInput?: HTMLInputElement;
}

// Documents the profile does not keep stay user-handled and are not listed.
const OTHER_FILE_WORDS =
  /성적\s*증명|졸업|재직|경력\s*증명|신분|주민|장애|보훈|가족|transcript|diploma/i;
// Per-project or per-task files are not the profile portfolio unless the
// same text names a profile document explicitly.
const ROW_FILE_WORDS = /프로젝트|과제|project/i;
const KIND_WORDS: readonly [AttachmentKind, RegExp][] = [
  ["photo", /사진|photo|picture/i],
  ["resume", /이력서|경력\s*기술서|resume|(?:^|[^a-z])cv(?:$|[^a-z])/i],
  ["portfolio", /포트폴리오|portfolio/i],
  ["evidence", /증빙|자격|면허|어학|certificate|licen[cs]e/i],
];

export const UNKNOWN_FIELD_REASON = "첨부할 파일 종류를 확인할 수 없어요.";
export const AMBIGUOUS_FIELD_REASON =
  "어떤 파일을 넣을 칸인지 확인할 수 없어요.";
export const DISABLED_FIELD_REASON = "비활성화된 칸이에요.";
export const FILLED_FIELD_REASON = "이미 파일이 첨부된 칸이에요.";

const GROUP_TEXT_LIMIT = 300;

function identifierWords(value: string | null): string {
  return (value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const TYPE_EXTENSIONS: Record<string, readonly string[]> = {
  [PDF_TYPE]: [".pdf"],
  [JPEG_TYPE]: [".jpg", ".jpeg"],
  [PNG_TYPE]: [".png"],
};

export function acceptsFile(
  input: HTMLInputElement,
  file: Pick<File, "name" | "type">,
): boolean {
  const accept = input.accept.trim();
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const extensions = TYPE_EXTENSIONS[file.type] ?? [];
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .some((token) => {
      if (token === "*" || token === "*/*" || token === file.type) return true;
      if (token.endsWith("/*")) return file.type.startsWith(token.slice(0, -1));
      return (
        token.startsWith(".") &&
        (extensions.includes(token) || name.endsWith(token))
      );
    });
}

export function acceptMismatchReason(type: string): string {
  return `${attachmentTypeLabel(type)} 파일을 받지 않는 칸이에요.`;
}

export function hasAttachedFile(input: HTMLInputElement): boolean {
  return (input.files?.length ?? 0) > 0;
}

/** Custom upload widgets hide the native input but keep its area visible. */
function isTargetable(input: HTMLInputElement): boolean {
  if (isVisibleWriteElement(input)) return true;
  const parent = input.parentElement;
  return !!parent && isVisibleWriteElement(parent);
}

/**
 * Ancestors that still belong to this input alone, nearest first: each holds
 * no other file input and stays short enough to be one field's label and hint.
 */
function ownGroups(input: HTMLInputElement): Element[] {
  const groups: Element[] = [];
  for (
    let node = input.parentElement, depth = 0;
    node && node !== input.ownerDocument.body && depth < 8;
    node = node.parentElement, depth += 1
  ) {
    if (node.querySelectorAll("input[type='file' i]").length > 1) break;
    if (normalized(node.textContent).length > GROUP_TEXT_LIMIT) break;
    groups.push(node);
  }
  return groups;
}

function withoutRequiredMark(value: string): string {
  return normalized(value.replace(/\*/g, "")) || value;
}

const URL_WORDS = /url|링크|link|https?:\/\//i;

/** The one visible, editable URL box that shares the file input's group. */
function pairedUrlInput(
  group: Element | undefined,
): HTMLInputElement | undefined {
  if (!group) return undefined;
  const candidates = Array.from(
    group.querySelectorAll<HTMLInputElement>(
      "input:not([type]), input[type='text' i], input[type='url' i]",
    ),
  ).filter((input) => {
    if (input.readOnly || !isVisibleWriteElement(input)) return false;
    if (input.type.toLowerCase() === "url") return true;
    const text = [labelOf(input), input.placeholder, input.name, input.id].join(
      " ",
    );
    return URL_WORDS.test(text);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

function firstText(group: Element): string | undefined {
  const walker = group.ownerDocument.createTreeWalker(
    group,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = normalized(node.textContent);
    if (text.replace(/[*\s]/g, "").length > 0) return text;
  }
  return undefined;
}

type Classification =
  | { result: "other" }
  | { result: "kind"; kind: AttachmentKind }
  | { result: "ambiguous" }
  | { result: "unknown" };

function classify(text: string): Classification {
  if (OTHER_FILE_WORDS.test(text)) return { result: "other" };
  const kinds = KIND_WORDS.filter(([, words]) => words.test(text)).map(
    ([kind]) => kind,
  );
  // "이력서용 사진" asks for a photo; any other mix stays undecided.
  if (kinds.length === 2 && kinds[0] === "photo" && kinds[1] === "resume")
    return { result: "kind", kind: "photo" };
  if (kinds.length > 1) return { result: "ambiguous" };
  const [kind] = kinds;
  if (kind) return { result: "kind", kind };
  return ROW_FILE_WORDS.test(text)
    ? { result: "other" }
    : { result: "unknown" };
}

/** Field state that does not depend on the file chosen for it. */
export function fieldBlockReason(input: HTMLInputElement): string | undefined {
  if (input.disabled) return DISABLED_FIELD_REASON;
  if (hasAttachedFile(input)) return FILLED_FIELD_REASON;
  return undefined;
}

export function findAttachmentFields(root: Document): AttachmentField[] {
  const fields: AttachmentField[] = [];
  for (const element of root.querySelectorAll<HTMLInputElement>(
    "input[type='file' i]",
  )) {
    if (!isTargetable(element)) continue;
    const name = element.getAttribute("name");
    const label = labelOf(element);
    const groups = ownGroups(element);
    const group = groups[groups.length - 1];
    const context = normalized(group?.textContent);
    // Visible text decides before internal names: the field's own label,
    // then the nearest enclosing text, and only then name/id (NHN names a
    // per-project file input "portfolio"). Reading the nearest group first
    // keeps a row's file away from a later section's title.
    let classification = classify(label ?? "");
    let deciding: Element | undefined;
    if (classification.result === "unknown")
      for (const candidate of groups) {
        const result = classify(normalized(candidate.textContent));
        if (result.result === "unknown") continue;
        classification = result;
        deciding = candidate;
        break;
      }
    if (classification.result === "unknown")
      classification = classify(
        [identifierWords(name), identifierWords(element.id)].join(" "),
      );
    if (classification.result === "other") continue;
    // A generic label ("첨부파일추가") is replaced by the group's title.
    const labelNamesKind = !!label && classify(label).result !== "unknown";
    const displayLabel = withoutRequiredMark(
      (!labelNamesKind && (deciding ?? group)
        ? firstText((deciding ?? group)!)
        : undefined) ??
        label ??
        (name || element.id || "파일 첨부 칸"),
    );
    if (classification.result !== "kind") {
      fields.push({
        element,
        label: displayLabel,
        context,
        blockedReason:
          classification.result === "ambiguous"
            ? AMBIGUOUS_FIELD_REASON
            : UNKNOWN_FIELD_REASON,
      });
      continue;
    }
    const urlInput =
      classification.kind === "resume" || classification.kind === "portfolio"
        ? pairedUrlInput(group)
        : undefined;
    fields.push({
      element,
      label: displayLabel,
      kind: classification.kind,
      context,
      blockedReason: fieldBlockReason(element),
      ...(urlInput ? { urlInput } : {}),
    });
  }
  return fields;
}
