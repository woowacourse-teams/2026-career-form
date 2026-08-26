// @ts-expect-error jsdom is a test-only dependency without a checked-in type package.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import html from "./hypothesis-validation-interview.html?raw";

function createResearchDom() {
  return new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: "file:///research/hypothesis-validation-interview.html",
  });
}

function getElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`필수 요소가 없습니다: ${id}`);
  }
  return element as T;
}

function fillInput(document: Document, id: string, value: string): void {
  getElement<HTMLInputElement>(document, id).value = value;
}

function startAssistedTaskForTest() {
  const dom = createResearchDom();
  const { document } = dom.window;

  fillInput(document, "participant-code", "P01");
  getElement<HTMLButtonElement>(document, "start-session").click();
  getElement<HTMLButtonElement>(document, "start-manual-task").click();

  const manualValues = {
    "manual-name": "김가온",
    "manual-email": "gaon.kim@example.com",
    "manual-phone": "010-0000-1001",
    "manual-birth-date": "2000-05-21",
    "manual-university": "한빛대학교(가상)",
    "manual-language-score": "TOEIC 900",
    "manual-veteran-status": "비해당",
    "manual-certificate-number": "CF-A-2024-0614",
  };
  Object.entries(manualValues).forEach(([id, value]) =>
    fillInput(document, id, value),
  );
  getElement<HTMLButtonElement>(document, "complete-manual-task").click();
  getElement<HTMLButtonElement>(document, "start-assisted-task").click();

  return dom;
}

function completeAssistedTaskForTest() {
  const dom = startAssistedTaskForTest();
  const { document } = dom.window;
  getElement<HTMLButtonElement>(document, "approve-autofill").click();

  const remainingValues = {
    "assisted-university": "새봄대학교(가상)",
    "assisted-language-score": "OPIc IH",
    "assisted-certificate-number": "CF-B-2023-1120",
    "assisted-veteran-status": "비해당",
  };
  Object.entries(remainingValues).forEach(([id, value]) =>
    fillInput(document, id, value),
  );
  getElement<HTMLButtonElement>(document, "complete-assisted-task").click();

  return dom;
}

function selectAllSurveyResponses(document: Document) {
  const selectedResponses = {
    "repeat-friction": "specific",
    "time-saving": "5",
    "partial-value": "5",
    "reason-understanding": "yes",
    trust: "4",
    intention: "yes",
    "automation-boundary": "fields",
  };
  Object.entries(selectedResponses).forEach(([name, value]) => {
    const input = document.querySelector<HTMLInputElement>(
      `#post-task-survey input[name="${name}"][value="${value}"]`,
    );
    if (!input) throw new Error(`사후 응답 항목이 없습니다: ${name}`);
    input.checked = true;
  });
}

describe("hypothesis validation interview prototype", () => {
  it("exposes the fixed interview landmarks and controls", () => {
    const { window } = createResearchDom();

    expect(window.document.querySelector("main")).not.toBeNull();
    expect(window.document.querySelector("header")).not.toBeNull();
    expect(window.document.querySelector("footer")).not.toBeNull();
    expect(window.document.querySelectorAll("fieldset").length).toBeGreaterThan(
      0,
    );

    [
      "participant-code",
      "start-session",
      "reset-session",
      "manual-task",
      "start-manual-task",
      "manual-form",
      "complete-manual-task",
      "manual-result",
      "assisted-task",
      "start-assisted-task",
      "autofill-review",
      "reveal-sensitive",
      "approve-autofill",
      "assisted-form",
      "complete-assisted-task",
      "assisted-result",
      "post-task-survey",
      "build-summary",
      "result-summary",
      "copy-summary",
    ].forEach((id) =>
      expect(window.document.getElementById(id)).not.toBeNull(),
    );

    expect(
      window.document.querySelectorAll("label[for]").length,
    ).toBeGreaterThan(0);
  });

  it("groups both applications into numbered sections with credential and language cards", () => {
    const { document } = createResearchDom().window;
    const expectedSections = [
      "01 기본 정보",
      "02 학력사항",
      "03 자격증·면허증",
      "04 어학",
      "05 보훈",
    ];

    ["manual", "assisted"].forEach((task) => {
      const form = getElement<HTMLFormElement>(document, `${task}-form`);
      const sections = [
        ...form.querySelectorAll<HTMLElement>(
          "fieldset[data-application-section]",
        ),
      ];

      expect(
        sections.map((section) =>
          section
            .querySelector("legend")
            ?.textContent?.replace(/\s+/g, " ")
            .trim(),
        ),
      ).toEqual(expectedSections);
      expect(form.querySelectorAll("input[data-fixture-key]")).toHaveLength(8);

      const expectedFieldSections = {
        name: "basic",
        email: "basic",
        phone: "basic",
        birthDate: "basic",
        university: "education",
        certificateNumber: "certification",
        languageScore: "language",
        veteranStatus: "veteran",
      };

      Object.entries(expectedFieldSections).forEach(([key, section]) => {
        const input = form.querySelector(`[data-fixture-key="${key}"]`);
        expect(input).not.toBeNull();
        expect(
          input?.closest(`fieldset[data-application-section="${section}"]`),
        ).not.toBeNull();
      });

      expect(
        form.querySelector(
          '[data-application-section="certification"] article h3',
        ),
      ).toHaveTextContent("자격증·면허증 1");
      expect(
        form.querySelector('[data-application-section="language"] article h3'),
      ).toHaveTextContent("공인외국어시험 1");
    });
  });

  it("keeps the prototype self-contained and free of persistence or network APIs", () => {
    const { document } = createResearchDom().window;

    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
    expect(document.querySelectorAll("link[href]")).toHaveLength(0);
    expect(
      document.querySelectorAll("img[src], video[src], audio[src]"),
    ).toHaveLength(0);
    expect(document.querySelectorAll("form[action]")).toHaveLength(0);
    expect(html).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|cookie)\b/,
    );
  });

  it("accepts only a P01-style participant code and starts an in-memory session", () => {
    const { window } = createResearchDom();
    const { document } = window;
    const code = getElement<HTMLInputElement>(document, "participant-code");
    const status = getElement<HTMLElement>(document, "session-status");

    code.value = "Alice";
    getElement<HTMLButtonElement>(document, "start-session").click();
    expect(status).toHaveTextContent("P01 형식");

    code.value = "P01";
    getElement<HTMLButtonElement>(document, "start-session").click();
    expect(status).toHaveTextContent("세션이 시작되었습니다");
    expect(getElement<HTMLElement>(document, "manual-task")).toBeVisible();
  });

  it("starts task A with eight empty fields and blocks task B until task A is complete", () => {
    const { window } = createResearchDom();
    const { document } = window;

    fillInput(document, "participant-code", "P01");
    getElement<HTMLButtonElement>(document, "start-session").click();
    getElement<HTMLButtonElement>(document, "start-manual-task").click();

    const manualInputs =
      document.querySelectorAll<HTMLInputElement>("#manual-form input");
    expect(manualInputs).toHaveLength(8);
    expect([...manualInputs].every((input) => input.value === "")).toBe(true);
    expect(
      getElement<HTMLButtonElement>(document, "start-assisted-task"),
    ).toBeDisabled();
    expect(getElement<HTMLElement>(document, "assisted-task")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("counts missing and incorrect values when task A is completed", () => {
    const { window } = createResearchDom();
    const { document } = window;

    fillInput(document, "participant-code", "P01");
    getElement<HTMLButtonElement>(document, "start-session").click();
    getElement<HTMLButtonElement>(document, "start-manual-task").click();

    fillInput(document, "manual-name", "김가온");
    fillInput(document, "manual-email", "wrong@example.com");
    fillInput(document, "manual-phone", "010-0000-1001");
    fillInput(document, "manual-birth-date", "2000-05-21");
    fillInput(document, "manual-university", "한빛대학교(가상)");
    fillInput(document, "manual-language-score", "TOEIC 900");
    fillInput(document, "manual-veteran-status", "비해당");

    getElement<HTMLButtonElement>(document, "complete-manual-task").click();

    expect(
      getElement<HTMLElement>(document, "manual-result"),
    ).toHaveTextContent("누락 1개");
    expect(
      getElement<HTMLElement>(document, "manual-result"),
    ).toHaveTextContent("오입력 1개");
    expect(
      getElement<HTMLButtonElement>(document, "start-assisted-task"),
    ).toBeEnabled();
  });

  it("selects only four available fields by default and disables the other statuses", () => {
    const { document } = startAssistedTaskForTest().window;
    const reviewInputs = document.querySelectorAll<HTMLInputElement>(
      "#autofill-review input[data-review-key]",
    );

    expect(reviewInputs).toHaveLength(8);
    expect(
      [...reviewInputs]
        .filter((input) => input.checked)
        .map((input) => input.dataset.reviewKey),
    ).toEqual(["name", "email", "phone", "birthDate"]);
    expect(
      [...reviewInputs]
        .filter((input) => input.disabled)
        .map((input) => input.dataset.reviewKey),
    ).toEqual([
      "university",
      "languageScore",
      "certificateNumber",
      "veteranStatus",
    ]);
    expect(document.querySelectorAll("#assisted-form input")).toHaveLength(8);
    expect(
      getElement<HTMLElement>(document, "sensitive-status"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(getElement<HTMLInputElement>(document, "assisted-name").value).toBe(
      "",
    );
    expect(
      getElement<HTMLElement>(document, "autofill-review"),
    ).toHaveTextContent(
      "프로필에 값이 없어 자격 정보 카드에서 직접 찾아 입력하세요",
    );
  });

  it("keeps task B values unchanged until final approval and applies only approved fields", () => {
    const { document } = startAssistedTaskForTest().window;
    const assistedForm = getElement<HTMLFormElement>(document, "assisted-form");
    const beforeApproval = assistedForm.innerHTML;

    getElement<HTMLButtonElement>(document, "reveal-sensitive").click();
    expect(
      getElement<HTMLInputElement>(document, "review-veteran-status"),
    ).toBeEnabled();
    expect(
      getElement<HTMLElement>(document, "sensitive-status"),
    ).toHaveAttribute("aria-hidden", "false");
    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).toHaveAttribute("aria-hidden", "false");
    expect(assistedForm.innerHTML).toBe(beforeApproval);

    getElement<HTMLInputElement>(document, "review-name").checked = false;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    expect(getElement<HTMLInputElement>(document, "assisted-name").value).toBe(
      "",
    );
    expect(getElement<HTMLInputElement>(document, "assisted-email").value).toBe(
      "seojun.lee@example.com",
    );
    expect(getElement<HTMLInputElement>(document, "assisted-phone").value).toBe(
      "010-0000-2002",
    );
    expect(
      getElement<HTMLInputElement>(document, "assisted-university").value,
    ).toBe("");
    expect(
      getElement<HTMLInputElement>(document, "assisted-certificate-number")
        .value,
    ).toBe("");

    getElement<HTMLInputElement>(document, "review-veteran-status").checked =
      true;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();
    expect(
      getElement<HTMLInputElement>(document, "assisted-veteran-status").value,
    ).toBe("비해당");
  });

  it("counts task B after approved fields and direct entries are both complete", () => {
    const { document } = startAssistedTaskForTest().window;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    const remainingValues = {
      "assisted-university": "새봄대학교(가상)",
      "assisted-language-score": "OPIc IH",
      "assisted-certificate-number": "CF-B-2023-1120",
      "assisted-veteran-status": "비해당",
    };
    Object.entries(remainingValues).forEach(([id, value]) =>
      fillInput(document, id, value),
    );
    getElement<HTMLButtonElement>(document, "complete-assisted-task").click();

    expect(
      getElement<HTMLElement>(document, "assisted-result"),
    ).toHaveTextContent("누락 0개");
    expect(
      getElement<HTMLElement>(document, "assisted-result"),
    ).toHaveTextContent("오입력 0개");
    expect(getElement<HTMLElement>(document, "post-task-survey")).toBeVisible();
  });

  it("counts task B missing and incorrect values instead of treating every field as correct", () => {
    const { document } = startAssistedTaskForTest().window;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();
    fillInput(document, "assisted-email", "wrong@example.com");
    fillInput(document, "assisted-phone", "");
    fillInput(document, "assisted-university", "새봄대학교(가상)");
    fillInput(document, "assisted-language-score", "OPIc IH");
    fillInput(document, "assisted-certificate-number", "CF-B-2023-1120");
    fillInput(document, "assisted-veteran-status", "비해당");

    getElement<HTMLButtonElement>(document, "complete-assisted-task").click();

    expect(
      getElement<HTMLElement>(document, "assisted-result"),
    ).toHaveTextContent("누락 1개");
    expect(
      getElement<HTMLElement>(document, "assisted-result"),
    ).toHaveTextContent("오입력 1개");
  });

  it("requires every structured post-task response before building a redacted summary", () => {
    const { document } = completeAssistedTaskForTest().window;

    getElement<HTMLButtonElement>(document, "build-summary").click();
    expect(
      getElement<HTMLElement>(document, "survey-status"),
    ).toHaveTextContent("모든 사후 질문을 먼저 완료하세요");
    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).toBe("");

    selectAllSurveyResponses(document);
    getElement<HTMLButtonElement>(document, "build-summary").click();

    const summary = getElement<HTMLTextAreaElement>(
      document,
      "result-summary",
    ).value;
    expect(summary).toContain("참가자 코드: P01");
    expect(summary).toContain("승인한 입력 가능 항목: 4개");
    expect(summary).toContain('"automation-boundary":"fields"');
    [
      "김가온",
      "gaon.kim@example.com",
      "이서준",
      "seojun.lee@example.com",
      "010-0000-1001",
      "010-0000-2002",
      "CF-A-2024-0614",
      "CF-B-2023-1120",
      "한빛대학교(가상)",
      "새봄대학교(가상)",
      "TOEIC 900",
      "OPIc IH",
    ].forEach((fixtureValue) => expect(summary).not.toContain(fixtureValue));
  });

  it("selects the read-only summary when clipboard copying fails", async () => {
    const dom = completeAssistedTaskForTest();
    const { document, navigator } = dom.window;
    selectAllSurveyResponses(document);
    getElement<HTMLButtonElement>(document, "build-summary").click();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });

    getElement<HTMLButtonElement>(document, "copy-summary").click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(getElement<HTMLElement>(document, "copy-status")).toHaveTextContent(
      "텍스트를 선택했습니다",
    );
    expect(document.activeElement).toBe(
      getElement<HTMLTextAreaElement>(document, "result-summary"),
    );
  });

  it("restores the first state and clears all in-memory controls on reset", () => {
    const dom = completeAssistedTaskForTest();
    const { document } = dom.window;
    fillInput(document, "participant-code", "P99");
    getElement<HTMLButtonElement>(document, "reset-session").click();

    expect(
      getElement<HTMLInputElement>(document, "participant-code").value,
    ).toBe("");
    expect(
      getElement<HTMLButtonElement>(document, "start-manual-task"),
    ).toBeDisabled();
    expect(
      getElement<HTMLButtonElement>(document, "start-assisted-task"),
    ).toBeDisabled();
    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).toBe("");
    expect(getElement<HTMLElement>(document, "manual-task")).not.toBeVisible();
    expect(
      getElement<HTMLElement>(document, "assisted-task"),
    ).not.toBeVisible();
    expect(
      getElement<HTMLElement>(document, "post-task-survey"),
    ).not.toBeVisible();
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#manual-form input"),
      ].every((input) => input.disabled && input.value === ""),
    ).toBe(true);
  });

  it("provides labels, keyboard focus targets, and no submission controls", () => {
    const { document } = createResearchDom().window;

    document
      .querySelectorAll<HTMLInputElement>("input[id]")
      .forEach((input: HTMLInputElement) => {
        expect(
          document.querySelector(`label[for="${input.id}"]`),
        ).not.toBeNull();
      });
    expect(document.querySelectorAll("button[type=submit]")).toHaveLength(0);
    expect(html).not.toMatch(
      /<button[^>]*>[^<]*(?:저장|다음 단계|미리보기|제출)/,
    );
    expect(
      document.querySelectorAll("[aria-live]").length,
    ).toBeGreaterThanOrEqual(5);
  });
});
