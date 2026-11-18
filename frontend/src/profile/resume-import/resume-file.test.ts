import { describe, expect, it, vi } from "vitest";
import {
  RESUME_MAX_BYTES,
  readResumeText,
  resumeFileType,
} from "./resume-file";

const file = (name: string, content: BlobPart, type = "") =>
  new File([content], name, { type });

describe("resumeFileType", () => {
  it.each([
    ["resume.pdf", "", "pdf"],
    ["RESUME.PDF", "", "pdf"],
    ["notes.md", "", "md"],
    ["notes.markdown", "", "md"],
    ["plain.txt", "", "txt"],
    ["no-extension", "application/pdf", "pdf"],
    ["no-extension", "text/plain", "txt"],
    ["no-extension", "text/markdown", "md"],
  ])("recognizes %s (%s) as %s", (name, type, expected) => {
    expect(resumeFileType({ name, type })).toBe(expected);
  });

  it.each([
    ["resume.docx", ""],
    ["resume.hwp", ""],
    ["image.png", "image/png"],
    ["archive", "application/zip"],
  ])("rejects %s", (name, type) => {
    expect(resumeFileType({ name, type })).toBeUndefined();
  });
});

describe("readResumeText", () => {
  it("reads markdown and text files as trimmed text with their length", async () => {
    const readPdf = vi.fn();
    await expect(
      readResumeText(file("a.md", "  # 합성 이력서\n학교 A  "), readPdf),
    ).resolves.toEqual({
      ok: true,
      fileType: "md",
      text: "# 합성 이력서\n학교 A",
      chars: 13,
    });
    await expect(
      readResumeText(file("a.txt", "synthetic"), readPdf),
    ).resolves.toMatchObject({ ok: true, fileType: "txt", chars: 9 });
    expect(readPdf).not.toHaveBeenCalled();
  });

  it("extracts PDF text through the injected reader", async () => {
    const readPdf = vi.fn(async () => "  synthetic pdf text \n");
    const result = await readResumeText(
      file("a.pdf", "%PDF-1.4", "application/pdf"),
      readPdf,
    );
    expect(result).toEqual({
      ok: true,
      fileType: "pdf",
      text: "synthetic pdf text",
      chars: 18,
    });
    expect(readPdf).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  });

  it("rejects an unsupported type without reading it", async () => {
    const readPdf = vi.fn();
    await expect(
      readResumeText(file("a.docx", "synthetic"), readPdf),
    ).resolves.toEqual({ ok: false, reason: "unsupported_type" });
    expect(readPdf).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit without reading it", async () => {
    const readPdf = vi.fn();
    const big = file("a.pdf", new Uint8Array(RESUME_MAX_BYTES + 1));
    await expect(readResumeText(big, readPdf)).resolves.toEqual({
      ok: false,
      fileType: "pdf",
      reason: "too_large",
    });
    expect(readPdf).not.toHaveBeenCalled();
    await expect(
      readResumeText(file("a.txt", new Uint8Array(RESUME_MAX_BYTES)), readPdf),
    ).resolves.toMatchObject({ ok: false, reason: "too_long" });
  });

  it("rejects a PDF without a text layer", async () => {
    await expect(
      readResumeText(file("a.pdf", "%PDF"), async () => " \n\n "),
    ).resolves.toEqual({
      ok: false,
      fileType: "pdf",
      reason: "no_text",
      chars: 0,
    });
  });

  it("rejects text longer than the server limit", async () => {
    await expect(
      readResumeText(file("a.txt", "가".repeat(20_001)), vi.fn()),
    ).resolves.toEqual({
      ok: false,
      fileType: "txt",
      reason: "too_long",
      chars: 20_001,
    });
    await expect(
      readResumeText(file("a.txt", "가".repeat(20_000)), vi.fn()),
    ).resolves.toMatchObject({ ok: true, chars: 20_000 });
  });

  it("reports a read failure as a code", async () => {
    await expect(
      readResumeText(file("a.pdf", "%PDF"), async () => {
        throw new Error("Invalid PDF structure");
      }),
    ).resolves.toEqual({ ok: false, fileType: "pdf", reason: "read_failed" });
  });
});
