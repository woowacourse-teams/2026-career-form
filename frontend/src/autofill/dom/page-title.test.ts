import { afterEach, describe, expect, it } from "vitest";
import { pageTitleMatcher } from "./page-title";

const isPageTitleText = (document: Document, text: string | undefined) =>
  pageTitleMatcher(document)(text);

function page(title: string, body: string) {
  document.title = title;
  document.body.innerHTML = body;
}

afterEach(() => {
  document.title = "";
  document.body.replaceChildren();
});

describe("문서 제목과 같은 글자", () => {
  it("문서 제목 전체, 구분자 앞부분, 구분자 뒷부분을 페이지 이름으로 본다", () => {
    page("플랫폼 엔지니어 (서버) | 가나다상사", "<input>");
    expect(
      isPageTitleText(document, "플랫폼 엔지니어 (서버) | 가나다상사"),
    ).toBe(true);
    expect(isPageTitleText(document, "플랫폼 엔지니어 (서버)")).toBe(true);
    expect(isPageTitleText(document, "가나다상사")).toBe(true);
  });

  it("공고 제목 안에 구분자가 있어도 앞부분 전체를 페이지 이름으로 본다", () => {
    page("백엔드 개발자 - 결제 플랫폼 | 가나다상사", "<input>");
    expect(isPageTitleText(document, "백엔드 개발자 - 결제 플랫폼")).toBe(true);
    expect(isPageTitleText(document, "백엔드 개발자")).toBe(true);
    expect(isPageTitleText(document, "결제 플랫폼 | 가나다상사")).toBe(true);
  });

  it("공백과 전각 문자가 달라도 같은 글자로 본다", () => {
    page("플랫폼  엔지니어 | 가나다상사", "<input>");
    expect(isPageTitleText(document, " 플랫폼 엔지니어 ")).toBe(true);
    expect(isPageTitleText(document, "플랫폼 엔지니어 ｜ 가나다상사")).toBe(
      true,
    );
  });

  it("구분자 없이 이어진 일부와 다른 글자는 페이지 이름이 아니다", () => {
    page("플랫폼 엔지니어 | 가나다상사", "<input>");
    expect(isPageTitleText(document, "플랫폼")).toBe(false);
    expect(isPageTitleText(document, "엔지니어 | 가나다상사")).toBe(false);
    expect(isPageTitleText(document, "학력")).toBe(false);
    expect(isPageTitleText(document, "")).toBe(false);
    expect(isPageTitleText(document, undefined)).toBe(false);
  });
});

describe("페이지 맨 위 제목", () => {
  it("첫 제목 뒤에 다른 제목이 있고 둘 다 첫 입력 칸보다 앞이면 첫 제목이 페이지 이름이다", () => {
    page(
      "채용 사이트",
      `<main>
        <div><h2>데이터 엔지니어(분석)</h2></div>
        <div><h3>인적사항</h3><label>이름<input></label></div>
        <div><h3>학력</h3><label>학교명<input></label></div>
      </main>`,
    );
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(true);
    expect(isPageTitleText(document, "인적사항")).toBe(false);
    expect(isPageTitleText(document, "학력")).toBe(false);
  });

  it("비어 있는 제목 요소는 건너뛴다", () => {
    page(
      "채용 사이트",
      `<header><h1><a href="/"></a></h1></header>
       <h2>데이터 엔지니어(분석)</h2>
       <h3>인적사항</h3><input>`,
    );
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(true);
  });

  it("첫 입력 칸 바로 위의 제목은 그 칸 묶음의 이름이다", () => {
    page(
      "채용 사이트",
      `<form>
        <h2>보호자 정보</h2><label>이름<input></label>
        <h2>학력</h2><label>학교명<input></label>
      </form>`,
    );
    expect(isPageTitleText(document, "보호자 정보")).toBe(false);
  });

  it("제목이 입력 칸보다 뒤에 있으면 페이지 이름이 아니다", () => {
    page(
      "채용 사이트",
      `<input type="search"><h1>데이터 엔지니어(분석)</h1><h2>인적사항</h2><input>`,
    );
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(false);
  });

  it("맨 위 제목도 구분자로 잘린 앞부분을 페이지 이름으로 본다", () => {
    page(
      "",
      `<h1>데이터 엔지니어(분석) | 가나다상사</h1><h2>지원서 작성</h2><input>`,
    );
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(true);
    expect(isPageTitleText(document, "지원서 작성")).toBe(false);
  });

  it("제목이나 입력 칸이 없으면 페이지 이름이 없다", () => {
    page("", "<h1>데이터 엔지니어(분석)</h1><h2>안내</h2>");
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(false);
    page("", "<input>");
    expect(isPageTitleText(document, "데이터 엔지니어(분석)")).toBe(false);
  });
});
