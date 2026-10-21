// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGuard } from "./guard.mjs";
import { panelFailureCode, panelState } from "./panel.mjs";

describe("installGuard", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="f"><input name="a">
        <button type="button" id="temp">임시저장</button>
        <button type="button" id="next">다음</button>
        <button type="submit" id="submit">제출</button>
        <button type="button" id="add">경력 사항 추가</button>
        <input type="file" id="file">
        <nav id="tab"><button type="button" id="stepTab" data-step="2">학력 경력</button></nav>
        <button type="button" id="prev">이전</button>
        <span role="button" id="spanNext">다음</span>
        <button type="button" id="bodySave">저장하기</button>
      </form>
      <div id="modal" class="modal-bg"><div class="modal">
        <button type="button" id="modalSave" data-button="modalSubmit">저장</button></div></div>
      <career-form-profile-panel><button id="ours">임시저장</button></career-form-profile-panel>`;
    installGuard();
  });
  afterEach(() => window.__careerFormLiveQa?.disarm());

  const click = (id) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById(id).dispatchEvent(event);
    return event.defaultPrevented;
  };

  it.each([
    "temp",
    "next",
    "submit",
    "file",
    "stepTab",
    "prev",
    "spanNext",
    "bodySave",
  ])("blocks a click on %s", (id) => {
    expect(click(id)).toBe(true);
    expect(window.__careerFormLiveQa).toMatchObject({ passed: false });
    expect(window.__careerFormLiveQa.forbiddenClicks).toBe(1);
  });

  it("lets row-add buttons, the address modal's 저장 and the extension's own panel through", () => {
    expect(click("modalSave")).toBe(false);
    expect(click("add")).toBe(false);
    expect(click("ours")).toBe(false);
    expect(window.__careerFormLiveQa.passed).toBe(true);
  });

  it("does not block controls that only mention 이전 or 다음 in passing", () => {
    document.body.innerHTML = `
      <label><input type="checkbox" id="same">이전 직장과 동일</label>
      <button type="button" id="addPrev">이전 경력 추가</button>
      <button type="button" id="daum">다음 주소 검색</button>
      <button type="button" id="nextStep">다음 단계</button>`;
    installGuard();
    expect(click("same")).toBe(false);
    expect(click("addPrev")).toBe(false);
    expect(click("daum")).toBe(false);
    expect(click("nextStep")).toBe(true);
  });

  it("does not treat a form carrying data-step as a step control", () => {
    document.body.innerHTML = `
      <form id="frm" data-step="1"><label><input type="radio" id="radio" name="g">남</label>
        <div id="plain">학력</div></form>`;
    installGuard();
    expect(click("radio")).toBe(false);
    expect(click("plain")).toBe(false);
    expect(window.__careerFormLiveQa.passed).toBe(true);
  });

  it.each([
    ["다음으로", '<button type="button" id="x">다음으로</button>'],
    ["이전으로", '<button type="button" id="x">이전으로 ‹</button>'],
    ["English Next", '<button type="button" id="x">Next</button>'],
    ["English Back", '<a id="x">back</a>'],
    ["지원하기", '<button type="button" id="x">지원하기</button>'],
    ["작성 완료", '<button type="button" id="x">작성 완료</button>'],
    ["인증번호 받기", '<button type="button" id="x">인증번호 받기</button>'],
    ["본인 인증", '<a id="x">본인인증</a>'],
    ["전체 동의", '<label id="x"><input type="checkbox">전체 동의</label>'],
    ["로그아웃", '<a id="x">로그아웃</a>'],
    ["onclick fnSave", '<a id="x" onclick="fnSave()"><i></i></a>'],
    ["href goNext", '<a id="x" href="javascript:goNext()"></a>'],
    [
      "class btn_next",
      '<button type="button" id="x" class="btn_next"></button>',
    ],
    [
      "id btnSave",
      '<button type="button" id="btnSave"><i id="x"></i></button>',
    ],
    [
      "name btnNextStep",
      '<button type="button" id="x" name="btnNextStep"></button>',
    ],
    [
      "data-type tempSave",
      '<button type="button" id="x" data-type="tempSave">학력</button>',
    ],
    [
      "an icon with alt 다음",
      '<button type="button" id="x"><img alt="다음"></button>',
    ],
    ["an icon titled 임시저장", '<a id="x"><img title="임시저장"></a>'],
    [
      "an SMS request",
      '<button type="button" id="x" onclick="sendSms()">요청</button>',
    ],
  ])("blocks %s", (_, markup) => {
    document.body.innerHTML = markup;
    installGuard();
    expect(click("x")).toBe(true);
  });

  it.each([
    [
      "경력 추가",
      '<button type="button" id="x" onclick="addCareer()">경력 추가</button>',
    ],
    [
      "자격증 추가",
      '<button type="button" id="x" class="btnAddCert">자격증 추가</button>',
    ],
    [
      "최종학력 radio",
      '<label id="x"><input type="radio" name="finalYn">최종학력</label>',
    ],
    [
      "학교 검색",
      '<button type="button" id="x" class="btn-search">검색</button>',
    ],
    [
      "a template class",
      '<button type="button" id="x" class="template-row">선택</button>',
    ],
  ])("lets %s through", (_, markup) => {
    document.body.innerHTML = markup;
    installGuard();
    expect(click("x")).toBe(false);
  });

  it("keeps the native submit for the harness's own step move", () => {
    expect(typeof window.__careerFormLiveQa.nativeSubmit).toBe("function");
    expect(window.__careerFormLiveQa.nativeSubmit).not.toBe(
      HTMLFormElement.prototype.submit,
    );
  });

  it("blocks form submission by event and by script", () => {
    const form = document.getElementById("f");
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.submit();
    form.requestSubmit();
    expect(window.__careerFormLiveQa.formSubmissions).toBe(3);
  });

  it("restores the page on disarm", () => {
    window.__careerFormLiveQa.disarm();
    expect(click("temp")).toBe(false);
  });
});

describe("panelState", () => {
  const mount = (html) => {
    const host = document.createElement("career-form-profile-panel");
    host.attachShadow({ mode: "open" }).innerHTML = html;
    document.body.replaceChildren(host);
  };

  it("reads result counts and pending items without preview values", () => {
    mount(`<h2>기입 결과</h2>
      <div role="tablist" aria-label="기입 결과 구분">
        <button role="tab" aria-label="입력 완료 12개"></button>
        <button role="tab" aria-label="확인 필요 1개"></button>
      </div>
      <section aria-label="확인 필요한 항목"><section aria-label="학력">
        <article><button aria-label="학교명 (1) 필드로 이동"></button><p>목록 선택을 확인하지 못했어요.</p></article>
      </section></section>`);
    expect(panelState()).toEqual({
      stage: "result",
      counts: { completed: 12, needsReview: 1 },
      pending: [
        {
          category: "학력",
          label: "학교명 (1)",
          guidance: "목록 선택을 확인하지 못했어요.",
          written: false,
        },
      ],
    });
  });

  it("recognizes review, preparation and exception screens", () => {
    mount(`<button>3개 항목 기입하기</button>`);
    expect(panelState()).toEqual({ stage: "review", writeEnabled: true });
    mount(`<button>준비하고 계속</button>`);
    expect(panelState()).toEqual({ stage: "preparation-review" });
    mount(
      `<header><span>예외</span><h2>현재 지원서 구조를 분석할 수 없습니다.</h2></header>`,
    );
    const state = panelState();
    expect(state).toEqual({
      stage: "exception",
      title: "현재 지원서 구조를 분석할 수 없습니다.",
    });
    expect(panelFailureCode(state)).toBe("extension-exception");
  });

  it("reports a closed panel", () => {
    document.body.innerHTML = "";
    expect(panelState()).toEqual({ stage: "closed" });
    expect(panelFailureCode({ stage: "unsupported" })).toBe(
      "extension-unsupported",
    );
  });
});
