// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearForm } from "./clear.mjs";

const value = (selector) => document.querySelector(selector).value;
const checked = (selector) => document.querySelector(selector).checked;

describe("clearForm on an Hplace MRS2 step", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="frm">
        <input type="hidden" name="resumeSn" value="77">
        <input type="hidden" name="step" value="2">
        <section class="writeResume" data-code="141">
          <input type="hidden" name="college[0].academyActivitySn" value="9">
          <input name="college[0].majorName" value="저장된 전공">
          <input name="college[0].credit" value="3.5" disabled>
          <select name="college[0].perfectScore" disabled><option value="4.5" selected>4.5</option></select>
          <label><input type="radio" name="college[0].dayOrNight" value="01" checked>주간</label>
          <label><input type="radio" name="patriot.patriotYn" value="false">비대상</label>
          <label><input type="radio" name="patriot.patriotYn" value="true" checked>대상</label>
          <span class="searchResultName">저장된 학교</span>
          <input name="currentAddress.address" value="저장된 주소" readonly>
          <select name="applySector[0].depth0"><option value="A" selected>분야</option></select>
        </section>
      </form>`;
  });

  it("returns counts only and restores a never-saved row state", () => {
    const counts = clearForm({ ignoreLayout: true });
    expect(JSON.stringify(counts)).not.toContain("저장");
    expect(value('[name="college[0].academyActivitySn"]')).toBe("");
    expect(value('[name="college[0].majorName"]')).toBe("");
    expect(value('[name="college[0].credit"]')).toBe("");
    expect(value('[name="college[0].perfectScore"]')).toBe("");
    expect(checked('[name="college[0].dayOrNight"]')).toBe(false);
    expect(document.querySelector("span.searchResultName").textContent).toBe(
      "",
    );
    expect(value('[name="currentAddress.address"]')).toBe("");
    expect(counts).toMatchObject({ hiddenRowIds: 1, searchDisplays: 1 });
  });

  it("in dry-run mode counts and names what it would clear without touching the page", () => {
    const before = document.body.innerHTML;
    const counts = clearForm({ ignoreLayout: true, dryRun: true });
    expect(document.body.innerHTML).toBe(before);
    expect(counts).toMatchObject({
      hiddenRowIds: 1,
      searchDisplays: 1,
      text: 2,
      disabledCleared: 2,
      radioGroups: 2,
    });
    expect(counts.fields).toEqual([
      "college[0].academyActivitySn",
      "college[0].majorName",
      "college[0].credit",
      "college[0].perfectScore",
      "currentAddress.address",
      "college[0].dayOrNight",
      "patriot.patriotYn",
    ]);
    expect(JSON.stringify(counts)).not.toContain("저장");
  });

  it("in dry-run mode does not count a 비대상 radio that is still at its default", () => {
    document.querySelector('[name="patriot.patriotYn"][value="true"]').checked =
      false;
    document.querySelector(
      '[name="patriot.patriotYn"][value="false"]',
    ).checked = true;
    const counts = clearForm({ ignoreLayout: true, dryRun: true });
    expect(counts.radioGroups).toBe(1);
    expect(counts.fields).not.toContain("patriot.patriotYn");
  });

  it("keeps navigation keys, job selection and restores the site's 비대상 default", () => {
    clearForm({ ignoreLayout: true });
    expect(value('[name="resumeSn"]')).toBe("77");
    expect(value('[name="step"]')).toBe("2");
    expect(value('[name="applySector[0].depth0"]')).toBe("A");
    expect(checked('[name="patriot.patriotYn"][value="false"]')).toBe(true);
  });
});

describe("clearForm on other platforms", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form>
        <input name="email" value="real@example.com">
        <input name="tel" value="010" disabled>
        <input name="name" value="실명" readonly>
        <input name="templateRow" value="default" style="display:none">
        <label><input type="radio" name="inExGb" value="D" checked>국내</label>
        <label><input type="radio" name="gender" value="M" checked>남</label>
        <label><input type="checkbox" name="agree" checked>개인정보 수집 동의</label>
        <textarea name="intro">저장된 소개</textarea>
      </form>`;
  });

  it("clears only visible, editable applicant values", () => {
    const counts = clearForm({ ignoreLayout: true });
    expect(value('[name="email"]')).toBe("");
    expect(value('[name="intro"]')).toBe("");
    expect(checked('[name="gender"]')).toBe(false);
    expect(value('[name="tel"]')).toBe("010");
    expect(value('[name="name"]')).toBe("실명");
    expect(value('[name="templateRow"]')).toBe("default");
    expect(counts).toMatchObject({
      text: 1,
      textarea: 1,
      radioGroups: 1,
      skippedReadonly: 1,
    });
  });

  it("protects consent and the Hyundai 국내/해외 toggle", () => {
    const counts = clearForm({ ignoreLayout: true });
    expect(checked('[name="agree"]')).toBe(true);
    expect(checked('[name="inExGb"]')).toBe(true);
    expect(counts.skippedProtected).toBe(2);
  });

  it("does not use Map or Set, which some sites replace", () => {
    // Hyundai's page scripts replace Map/Set; page functions must not need them.
    expect(clearForm.toString()).not.toMatch(/\b(Map|Set)\b/);
  });
});

describe("clearForm protection and widgets", () => {
  it("keeps the SK job selection, recognized by name, title or select-label", () => {
    document.body.innerHTML = `
      <form>
        <div class="form-item"><div class="select-label">지원 직무(1지망)</div>
          <select name="appJobRoleLevel1"><option value="">선택</option><option value="152" selected>정보보안</option></select></div>
        <select name="x1" title="지원 직무(2지망)"><option value="">선택</option><option value="9" selected>A</option></select>
        <select name="hobby"><option value="">선택</option><option value="1" selected>독서</option></select>
      </form>`;
    clearForm({ ignoreLayout: true });
    expect(value('[name="appJobRoleLevel1"]')).toBe("152");
    expect(value('[name="x1"]')).toBe("9");
    expect(value('[name="hobby"]')).toBe("");
  });

  it("keeps protected hidden inputs inside Hplace sections", () => {
    document.body.innerHTML = `
      <form id="frm"><section class="writeResume" data-code="11">
        <input type="hidden" name="contact.mobile" value="saved">
        <input type="hidden" name="applySector[0].code" value="A">
        <input type="hidden" name="college[0].academyActivitySn" value="9">
      </section></form>`;
    clearForm({ ignoreLayout: true });
    expect(value('[name="contact.mobile"]')).toBe("saved");
    expect(value('[name="applySector[0].code"]')).toBe("A");
    expect(value('[name="college[0].academyActivitySn"]')).toBe("");
  });

  it("counts custom widgets it could not clear", () => {
    document.body.innerHTML = `
      <form>
        <div class="select-wrap"><input type="hidden" class="js-field" name="milCd" value="1">
          <input type="button" class="btn-select" value="군필"></div>
        <div class="select-wrap"><input type="hidden" class="js-field" name="schGb" value="">
          <input type="button" class="btn-select" value="선택하세요."></div>
        <button type="button" role="combobox"><span>학사</span></button>
        <button type="button" role="combobox" data-placeholder-shown><span>선택</span></button>
        <div role="radiogroup"><button role="radio" aria-checked="true">대상</button></div>
      </form>`;
    expect(clearForm({ ignoreLayout: true }).widgetsLeft).toBe(3);
  });
});
