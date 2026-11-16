import { afterEach, describe, expect, it } from "vitest";

import {
  acceptsFile,
  AMBIGUOUS_FIELD_REASON,
  findAttachmentFields,
  UNKNOWN_FIELD_REASON,
} from "./file-fields";

afterEach(() => document.body.replaceChildren());

function fields() {
  return findAttachmentFields(document).map(
    ({ label, kind, blockedReason }) => ({
      label,
      kind,
      blockedReason,
    }),
  );
}

describe("findAttachmentFields", () => {
  it("classifies resume, portfolio, photo and evidence fields by their labels", () => {
    document.body.innerHTML = `
      <label for="a">이력서 첨부</label><input id="a" type="file" accept=".pdf">
      <label>포트폴리오<input type="file" accept="application/pdf,.doc"></label>
      <label for="c">CV (PDF)</label><input id="c" type="file">
      <label for="d">증명사진</label><input id="d" type="file" accept="image/*">
      <label for="e">자격증 사본</label><input id="e" type="file">
      <label for="f">어학 성적 증빙</label><input id="f" type="file">
      <input type="text" aria-label="이력서 링크">`;

    expect(fields().map((field) => [field.label, field.kind])).toEqual([
      ["이력서 첨부", "resume"],
      ["포트폴리오", "portfolio"],
      ["CV (PDF)", "resume"],
      ["증명사진", "photo"],
      ["자격증 사본", "evidence"],
      ["어학 성적 증빙", "evidence"],
    ]);
  });

  it("falls back to name or id when there is no label", () => {
    document.body.innerHTML = `
      <input type="file" name="resumeFile">
      <input type="file" id="portfolio_upload">
      <input type="file" name="cvUpload">
      <input type="file" id="prsPhoto">`;

    expect(fields().map((field) => [field.label, field.kind])).toEqual([
      ["resumeFile", "resume"],
      ["portfolio_upload", "portfolio"],
      ["cvUpload", "resume"],
      ["prsPhoto", "photo"],
    ]);
  });

  it("leaves documents the profile does not keep out entirely", () => {
    document.body.innerHTML = `
      <label for="t">성적증명서</label><input id="t" type="file">
      <label for="g">졸업증명서</label><input id="g" type="file">
      <label for="w">재직증명서(경력 이력서 대체 불가)</label><input id="w" type="file">
      <label for="i">신분증</label><input id="i" type="file">
      <label for="v">국가보훈대상자 증빙 서류</label><input id="v" type="file">
      <label for="h">장애인 증빙 서류</label><input id="h" type="file">`;

    expect(fields()).toEqual([]);
  });

  it("marks fields without one confirmed meaning as unavailable", () => {
    document.body.innerHTML = `
      <label for="x">첨부파일</label><input id="x" type="file">
      <label for="y">이력서 및 포트폴리오</label><input id="y" type="file">
      <input type="file">`;

    expect(fields()).toEqual([
      {
        label: "첨부파일",
        kind: undefined,
        blockedReason: UNKNOWN_FIELD_REASON,
      },
      {
        label: "이력서 및 포트폴리오",
        kind: undefined,
        blockedReason: AMBIGUOUS_FIELD_REASON,
      },
      {
        label: "파일 첨부 칸",
        kind: undefined,
        blockedReason: UNKNOWN_FIELD_REASON,
      },
    ]);
  });

  it("blocks disabled fields and fields that already hold a file", () => {
    document.body.innerHTML = `
      <label for="a">이력서</label><input id="a" type="file" disabled>
      <label for="b">포트폴리오</label><input id="b" type="file">`;
    Object.defineProperty(document.querySelector("#b"), "files", {
      value: { length: 1, 0: new File(["x"], "existing.pdf") },
    });

    expect(fields().map((field) => field.blockedReason)).toEqual([
      "비활성화된 칸이에요.",
      "이미 파일이 첨부된 칸이에요.",
    ]);
  });

  it("keeps hidden inputs of a visible upload area and skips hidden areas", () => {
    document.body.innerHTML = `
      <div><label for="a">이력서 업로드</label>
        <input id="a" type="file" style="display:none"></div>
      <div><span>포트폴리오</span><input type="file" hidden aria-hidden="true">
        <button type="button">파일 찾기</button></div>
      <div style="display:none"><label for="b">포트폴리오</label><input id="b" type="file"></div>
      <div hidden><label for="c">이력서</label><input id="c" type="file"></div>`;

    expect(fields().map((field) => field.label)).toEqual([
      "이력서 업로드",
      "포트폴리오",
    ]);
  });
});

describe("site-shaped file fields", () => {
  it("reads the section title when the label only says 첨부파일추가", () => {
    document.body.innerHTML = `<div class="attach">
      <div class="item"><strong>경력기술서</strong><span>필수</span>
        <div><label for="attachCareersFile">첨부파일추가</label>
          <input id="attachCareersFile" type="file" accept="application/pdf">
          <button type="button">파일추가</button><button type="button">URL추가</button></div></div>
      <div class="item"><strong>포트폴리오</strong>
        <div><label for="attachPortfoliosFile">첨부파일추가</label>
          <input id="attachPortfoliosFile" type="file" accept="application/pdf">
          <button type="button">파일추가</button><button type="button">URL추가</button></div></div>
    </div>`;

    expect(fields()).toEqual([
      { label: "경력기술서", kind: "resume", blockedReason: undefined },
      { label: "포트폴리오", kind: "portfolio", blockedReason: undefined },
    ]);
  });

  it("reads an unassociated group label for inputs without labels", () => {
    document.body.innerHTML = `<div><span>제출서류</span>
      <div><label>이력서/경력기술서<span>*</span></label><p>PDF 형식으로 올려주세요.</p>
        <div><div><input type="file"><div role="button" aria-label="dropzone">파일 업로드</div></div></div></div>
      <div><label>포트폴리오</label><p>PDF 형식으로 올려주세요.</p>
        <div><div><input type="file"><div role="button" aria-label="dropzone">파일 업로드</div></div></div></div>
    </div>`;

    expect(fields().map((field) => [field.label, field.kind])).toEqual([
      ["이력서/경력기술서", "resume"],
      ["포트폴리오", "portfolio"],
    ]);
  });

  it("uses each field's own label even when hints mention other documents", () => {
    document.body.innerHTML = `<form>
      <div><label for="r">이력서 및 경력기술서</label>
        <div><input id="r" name="fields.resume" type="file" accept=".pdf,.doc,.docx">
        <p>이력서 및 경력기술서는 자유양식이며, 한 개의 파일로 통합해 제출해주세요.</p></div></div>
      <div><label for="p">포트폴리오 (선택사항)</label>
        <div><input id="p" name="fields.cover_letter" type="file" accept=".pdf,.doc,.docx">
        <p>포트폴리오는 PDF 파일로 제출해 주세요.</p></div></div>
      <div><label for="v">보훈 대상</label>
        <div><input id="v" name="question_1" type="file"><p>해당하는 경우, 증빙자료를 첨부해 주세요.</p></div></div>
    </form>`;

    expect(fields().map((field) => [field.label, field.kind])).toEqual([
      ["이력서 및 경력기술서", "resume"],
      ["포트폴리오 (선택사항)", "portfolio"],
    ]);
  });

  it("does not use a whole form as the group of a lone file input", () => {
    document.body.innerHTML = `<form><h2>지원서</h2><p>${"이력서 포트폴리오 안내 ".repeat(30)}</p>
      <div><input type="file"></div></form>`;

    expect(fields()).toEqual([
      {
        label: "파일 첨부 칸",
        kind: undefined,
        blockedReason: UNKNOWN_FIELD_REASON,
      },
    ]);
  });
});

describe("row files", () => {
  it("keeps per-project files out unless the text names a profile document", () => {
    document.body.innerHTML = `
      <section><h3>프로젝트</h3><div>
        <div><label for="a"><span>관련 파일 첨부(선택)</span></label><input id="a" type="file" hidden></div>
        <button type="button">프로젝트 추가</button></div></section>
      <section><div>포트폴리오</div><p>링크나 파일이 있다면 첨부해 주세요.</p></section>
      <div><label for="b">프로젝트 포트폴리오</label><input id="b" type="file"></div>`;

    expect(
      findAttachmentFields(document).map((field) => [
        field.element.id,
        field.kind,
      ]),
    ).toEqual([["b", "portfolio"]]);
  });
});

describe("acceptsFile", () => {
  const input = (accept: string) =>
    Object.assign(document.createElement("input"), { type: "file", accept });
  const pdf = { name: "a.pdf", type: "application/pdf" };
  const jpeg = { name: "a.jpeg", type: "image/jpeg" };

  it.each([
    ["", pdf, true],
    [".pdf,.doc", pdf, true],
    ["application/*", pdf, true],
    ["*/*", pdf, true],
    [".zip,image/*", pdf, false],
    ["image/*", jpeg, true],
    [".jpg,.png", jpeg, true],
    [".png", jpeg, false],
    ["application/pdf", jpeg, false],
  ])("accept %s with %o is %s", (accept, file, expected) => {
    expect(acceptsFile(input(accept), file)).toBe(expected);
  });
});
