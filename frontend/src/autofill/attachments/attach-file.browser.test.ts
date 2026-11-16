import { afterEach, describe, expect, it } from "vitest";

import {
  attachFile,
  DETACHED_FIELD_REASON,
  UNVERIFIED_ATTACH_REASON,
} from "./attach-file";
import { findAttachmentFields } from "./file-fields";

afterEach(() => document.body.replaceChildren());

function syntheticPdf(name = "synthetic-resume.pdf") {
  return new File(["%PDF-1.4 synthetic"], name, { type: "application/pdf" });
}

describe("attachFile in Chromium", () => {
  it("attaches the file to a confirmed field and fires bubbling input and change", () => {
    document.body.innerHTML = `<form>
      <label for="resume">이력서</label><input id="resume" type="file" accept=".pdf">
      <label for="photo">증명사진</label><input id="photo" type="file"></form>`;
    const events: string[] = [];
    const form = document.querySelector("form")!;
    form.addEventListener("input", (event) =>
      events.push(`input:${(event.target as HTMLElement).id}`),
    );
    form.addEventListener("change", (event) =>
      events.push(`change:${(event.target as HTMLElement).id}`),
    );
    const [field] = findAttachmentFields(document);

    expect(field?.kind).toBe("resume");
    expect(attachFile(field!.element, syntheticPdf())).toEqual({
      status: "attached",
    });
    expect(field!.element.files?.[0]?.name).toBe("synthetic-resume.pdf");
    expect(events).toEqual(["input:resume", "change:resume"]);
    expect(
      document.querySelector<HTMLInputElement>("#photo")!.files,
    ).toHaveLength(0);
  });

  it("attaches to a hidden input inside a visible upload area", () => {
    document.body.innerHTML = `<div><label for="p">포트폴리오</label>
      <input id="p" type="file" style="display:none"></div>`;
    const [field] = findAttachmentFields(document);

    expect(field?.kind).toBe("portfolio");
    expect(attachFile(field!.element, syntheticPdf("p.pdf")).status).toBe(
      "attached",
    );
  });

  it("does not overwrite a field that received a file after review", () => {
    document.body.innerHTML = `<label for="a">이력서</label><input id="a" type="file">`;
    const [field] = findAttachmentFields(document);
    const existing = new DataTransfer();
    existing.items.add(new File(["x"], "site-file.pdf"));
    field!.element.files = existing.files;

    expect(attachFile(field!.element, syntheticPdf())).toEqual({
      status: "blocked",
      reason: "이미 파일이 첨부된 칸이에요.",
    });
    expect(field!.element.files?.[0]?.name).toBe("site-file.pdf");
  });

  it("rechecks disabled and detached fields right before attaching", () => {
    document.body.innerHTML = `<label for="a">이력서</label><input id="a" type="file">`;
    const [field] = findAttachmentFields(document);
    field!.element.disabled = true;
    expect(attachFile(field!.element, syntheticPdf()).status).toBe("blocked");

    field!.element.disabled = false;
    field!.element.remove();
    expect(attachFile(field!.element, syntheticPdf())).toEqual({
      status: "blocked",
      reason: DETACHED_FIELD_REASON,
    });
  });

  it("reports an attachment the page cleared during change as unverified", () => {
    document.body.innerHTML = `<label for="a">이력서</label><input id="a" type="file">`;
    const [field] = findAttachmentFields(document);
    field!.element.addEventListener("change", () => {
      field!.element.value = "";
    });

    expect(attachFile(field!.element, syntheticPdf())).toEqual({
      status: "unverified",
      reason: UNVERIFIED_ATTACH_REASON,
    });
  });
});
