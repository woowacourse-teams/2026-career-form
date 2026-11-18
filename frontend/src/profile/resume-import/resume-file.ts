export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
/** Same limit as the server (#469): trimmed UTF-16 length, i.e. String.length. */
export const RESUME_MAX_CHARS = 20_000;

export type ResumeFileType = "pdf" | "md" | "txt";
export type ResumeRejection =
  "unsupported_type" | "too_large" | "no_text" | "too_long" | "read_failed";
export type ResumeText =
  | { ok: true; fileType: ResumeFileType; text: string; chars: number }
  | {
      ok: false;
      fileType?: ResumeFileType;
      reason: ResumeRejection;
      chars?: number;
    };

export const RESUME_FILE_ACCEPT =
  ".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

const BY_EXTENSION: Readonly<Record<string, ResumeFileType>> = {
  pdf: "pdf",
  md: "md",
  markdown: "md",
  txt: "txt",
};
const BY_MIME: Readonly<Record<string, ResumeFileType>> = {
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/plain": "txt",
};

/** The extension decides first; files without one fall back to the browser's MIME type. */
export function resumeFileType(file: {
  name: string;
  type: string;
}): ResumeFileType | undefined {
  const dot = file.name.lastIndexOf(".");
  if (dot > 0) return BY_EXTENSION[file.name.slice(dot + 1).toLowerCase()];
  return BY_MIME[file.type.toLowerCase()];
}

/** Everything happens locally; nothing here sends or stores the file. */
export async function readResumeText(
  file: File,
  readPdf: (data: ArrayBuffer) => Promise<string>,
): Promise<ResumeText> {
  const fileType = resumeFileType(file);
  if (!fileType) return { ok: false, reason: "unsupported_type" };
  if (file.size > RESUME_MAX_BYTES)
    return { ok: false, fileType, reason: "too_large" };
  let raw: string;
  try {
    raw =
      fileType === "pdf"
        ? await readPdf(await file.arrayBuffer())
        : await file.text();
  } catch {
    return { ok: false, fileType, reason: "read_failed" };
  }
  const text = raw.trim();
  const chars = text.length;
  if (!chars) return { ok: false, fileType, reason: "no_text", chars };
  if (chars > RESUME_MAX_CHARS)
    return { ok: false, fileType, reason: "too_long", chars };
  return { ok: true, fileType, text, chars };
}
