export const SINGLE_ATTACHMENT_KINDS = [
  "resume",
  "portfolio",
  "photo",
] as const;
export type SingleAttachmentKind = (typeof SINGLE_ATTACHMENT_KINDS)[number];
/** What a file field asks for; evidence files belong to one profile entry. */
export type AttachmentKind = SingleAttachmentKind | "evidence";
/** Where one stored file lives: a single kind or one entry's evidence. */
export type AttachmentSlot = SingleAttachmentKind | `evidence:${string}`;

export const ATTACHMENT_LABEL: Record<AttachmentKind, string> = {
  resume: "이력서·경력기술서",
  portfolio: "포트폴리오",
  photo: "증명사진",
  evidence: "증빙 서류",
};

export const PDF_TYPE = "application/pdf";
export const JPEG_TYPE = "image/jpeg";
export const PNG_TYPE = "image/png";
const MB = 1024 * 1024;

interface AttachmentRule {
  types: readonly string[];
  maxBytes: number;
  formatError: string;
  sizeError: string;
  accept: string;
}

export const ATTACHMENT_RULES: Record<AttachmentKind, AttachmentRule> = {
  resume: {
    types: [PDF_TYPE],
    maxBytes: 20 * MB,
    formatError: "PDF 파일만 등록할 수 있어요.",
    sizeError: "20MB 이하 파일만 등록할 수 있어요.",
    accept: ".pdf,application/pdf",
  },
  portfolio: {
    types: [PDF_TYPE],
    maxBytes: 20 * MB,
    formatError: "PDF 파일만 등록할 수 있어요.",
    sizeError: "20MB 이하 파일만 등록할 수 있어요.",
    accept: ".pdf,application/pdf",
  },
  photo: {
    types: [JPEG_TYPE, PNG_TYPE],
    maxBytes: 5 * MB,
    formatError: "JPG·PNG 파일만 등록할 수 있어요.",
    sizeError: "5MB 이하 파일만 등록할 수 있어요.",
    accept: ".jpg,.jpeg,.png,image/jpeg,image/png",
  },
  evidence: {
    types: [PDF_TYPE, JPEG_TYPE, PNG_TYPE],
    maxBytes: 20 * MB,
    formatError: "PDF·JPG·PNG 파일만 등록할 수 있어요.",
    sizeError: "20MB 이하 파일만 등록할 수 있어요.",
    accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
  },
};

/** Kept for callers that only deal with the resume/portfolio PDF limit. */
export const MAX_ATTACHMENT_BYTES = ATTACHMENT_RULES.resume.maxBytes;

export interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
  updatedAt: string;
}

export type AttachmentList = Partial<Record<AttachmentSlot, AttachmentMeta>>;

/** Kinds whose application fields often offer a URL instead of a file. */
export const LINK_KINDS = ["resume", "portfolio"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export type AttachmentLinks = Partial<Record<LinkKind, string>>;
export const MAX_LINK_LENGTH = 500;

export function isLinkKind(kind: AttachmentKind | undefined): kind is LinkKind {
  return kind === "resume" || kind === "portfolio";
}

export function attachmentLinkError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "링크를 입력해 주세요.";
  if (trimmed.length > MAX_LINK_LENGTH)
    return "500자 이하 링크만 저장할 수 있어요.";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return undefined;
  } catch {
    // fall through
  }
  return "http:// 또는 https://로 시작하는 주소를 입력해 주세요.";
}

/** Profile attachments live apart from the profile JSON and never leave the browser. */
export interface AttachmentStore {
  /** Metadata only; evidence is listed for the given profile entries. */
  list(evidenceEntryIds?: readonly string[]): Promise<AttachmentList>;
  save(slot: AttachmentSlot, file: File): Promise<AttachmentMeta>;
  remove(slot: AttachmentSlot): Promise<void>;
  loadFile(slot: AttachmentSlot): Promise<File | undefined>;
  /** Drops evidence files whose profile entry no longer exists. */
  pruneEvidence(keepEntryIds: readonly string[]): Promise<void>;
  /** Optional resume/portfolio links, used only where no file is stored. */
  loadLinks(): Promise<AttachmentLinks>;
  saveLink(kind: LinkKind, url: string): Promise<string>;
  removeLink(kind: LinkKind): Promise<void>;
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

export function evidenceSlot(entryId: string): AttachmentSlot {
  return `evidence:${entryId}`;
}

export function slotKind(slot: AttachmentSlot): AttachmentKind {
  return slot.startsWith("evidence:")
    ? "evidence"
    : (slot as SingleAttachmentKind);
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: PDF_TYPE,
  jpg: JPEG_TYPE,
  jpeg: JPEG_TYPE,
  png: PNG_TYPE,
};

/** The stored MIME type of an allowed file, or undefined when not allowed. */
export function allowedAttachmentType(
  file: Pick<File, "name" | "type">,
  kind: AttachmentKind,
): string | undefined {
  const { types } = ATTACHMENT_RULES[kind];
  if (types.includes(file.type)) return file.type;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const byExtension = extension ? EXTENSION_TYPES[extension] : undefined;
  return byExtension && types.includes(byExtension) ? byExtension : undefined;
}

export function attachmentFileError(
  file: Pick<File, "name" | "type" | "size">,
  kind: AttachmentKind,
): string | undefined {
  const rule = ATTACHMENT_RULES[kind];
  if (!allowedAttachmentType(file, kind)) return rule.formatError;
  if (file.size <= 0) return "빈 파일은 등록할 수 없어요.";
  if (file.size > rule.maxBytes) return rule.sizeError;
  return undefined;
}

export function isAttachmentMeta(value: unknown): value is AttachmentMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.name === "string" &&
    meta.name.length > 0 &&
    typeof meta.type === "string" &&
    typeof meta.size === "number" &&
    Number.isInteger(meta.size) &&
    meta.size > 0 &&
    typeof meta.updatedAt === "string"
  );
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export function attachmentTypeLabel(type: string): string {
  if (type === PDF_TYPE) return "PDF";
  if (type === JPEG_TYPE) return "JPG";
  if (type === PNG_TYPE) return "PNG";
  return "이 형식의";
}
