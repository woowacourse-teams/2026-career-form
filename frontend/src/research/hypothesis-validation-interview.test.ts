import { describe, expect, it, vi } from "vitest";

import {
  ASSISTED_DIRECT_INPUT_VALUES,
  completeAssistedTaskForTest,
  createResearchDom,
  DEFAULT_APPROVED_ASSISTED_VALUES,
  EMPTY_FORM_VALUES,
  EXPECTED_ASSISTED_SOURCE_CARD_TITLES,
  EXPECTED_ASSISTED_SOURCE_CARD_VALUES,
  EXPECTED_DETAIL_FIELDS,
  EXPECTED_FIELD_KEYS,
  EXPECTED_FIELD_KEYS_BY_SECTION,
  EXPECTED_MANUAL_SOURCE_CARD_TITLES,
  EXPECTED_MANUAL_SOURCE_CARD_VALUES,
  EXPECTED_REVIEW_KEYS,
  EXPECTED_REVIEW_VALUES,
  EXPECTED_SECTIONS,
  EXPECTED_STATUS_LABELS,
  fillInput,
  fillInputs,
  getElement,
  html,
  MANUAL_INPUT_VALUES,
  normalizeText,
  readDefinitionPairs,
  readFormValues,
  readReviewInputs,
  REDACTED_FIXTURE_VALUES,
  selectAllSurveyResponses,
  startAssistedTaskForTest,
} from "./hypothesis-validation-interview.test-support";

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

  it("groups exactly seventeen application fields into the required sections", () => {
    const { document } = createResearchDom().window;
    ["manual", "assisted"].forEach((task) => {
      const form = getElement<HTMLFormElement>(document, `${task}-form`);
      const sections = [
        ...form.querySelectorAll<HTMLElement>(
          "fieldset[data-application-section]",
        ),
      ];

      expect(
        sections.map((section) =>
          normalizeText(section.querySelector("legend")?.textContent),
        ),
      ).toEqual(EXPECTED_SECTIONS);
      const fixtureInputs = [
        ...form.querySelectorAll<HTMLInputElement>("input[data-fixture-key]"),
      ];
      expect(fixtureInputs.length).toBe(17);
      expect(fixtureInputs.map((input) => input.dataset.fixtureKey)).toEqual(
        EXPECTED_FIELD_KEYS,
      );

      Object.entries(EXPECTED_FIELD_KEYS_BY_SECTION).forEach(
        ([section, expectedKeys]) => {
          const sectionFields = form.querySelector(
            `fieldset[data-application-section="${section}"]`,
          );
          expect(sectionFields).not.toBeNull();
          expect(
            [
              ...(sectionFields?.querySelectorAll<HTMLInputElement>(
                "input[data-fixture-key]",
              ) ?? []),
            ].map((input) => input.dataset.fixtureKey),
          ).toEqual(expectedKeys);
        },
      );

      if (task === "assisted") {
        expect(fixtureInputs.map((input) => input.dataset.assistedKey)).toEqual(
          EXPECTED_FIELD_KEYS,
        );
      }

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

  it("labels each credential and language detail as an independent input", () => {
    const { document } = createResearchDom().window;

    ["manual", "assisted"].forEach((task) => {
      const form = getElement<HTMLFormElement>(document, `${task}-form`);

      Object.entries(EXPECTED_DETAIL_FIELDS).forEach(
        ([key, { label: expectedLabel, type: expectedType }]) => {
          const input = form.querySelector<HTMLInputElement>(
            `input[data-fixture-key="${key}"]`,
          );
          expect(input).not.toBeNull();
          expect(input?.type).toBe(expectedType);

          const label = input
            ? form.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)
            : null;
          expect(normalizeText(label?.textContent)).toBe(expectedLabel);
        },
      );
    });
  });

  it("shows person A's seventeen values across exactly four source cards", () => {
    const { document } = createResearchDom().window;
    const sourceBoard = getElement<HTMLElement>(
      document,
      "manual-source-board",
    );
    const cards = [
      ...sourceBoard.querySelectorAll<HTMLElement>("article.source-card"),
    ];

    expect(cards.length).toBe(4);
    expect(
      cards.map((card) => normalizeText(card.querySelector("h3")?.textContent)),
    ).toEqual(EXPECTED_MANUAL_SOURCE_CARD_TITLES);
    expect(cards.map(readDefinitionPairs)).toEqual(
      EXPECTED_MANUAL_SOURCE_CARD_VALUES,
    );
    expect(
      normalizeText(
        document.querySelector("#manual-task .task-heading .muted")
          ?.textContent,
      ),
    ).toContain("왼쪽 네 카드");
    expect(
      normalizeText(
        document.querySelector("#manual-task .task-meta")?.textContent,
      ),
    ).toContain("17개 필드 · 4개 정보 카드");
  });

  it("shows person B's detailed sources without exposing the sensitive value", () => {
    const { document } = createResearchDom().window;
    const sourceBoard = getElement<HTMLElement>(
      document,
      "assisted-source-board",
    );
    const cards = [
      ...sourceBoard.querySelectorAll<HTMLElement>("article.source-card"),
    ];

    expect(cards.length).toBe(3);
    expect(
      cards.map((card) => normalizeText(card.querySelector("h3")?.textContent)),
    ).toEqual(EXPECTED_ASSISTED_SOURCE_CARD_TITLES);
    expect(cards.map(readDefinitionPairs)).toEqual(
      EXPECTED_ASSISTED_SOURCE_CARD_VALUES,
    );
    expect(sourceBoard).not.toHaveTextContent("비해당");
    expect(
      normalizeText(
        document.querySelector("#assisted-task .task-meta")?.textContent,
      ),
    ).toContain(
      "17개 필드 · 입력 가능 4개 · 확인 필요 7개 · 입력 불가 5개 · 민감 확인 1개",
    );
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

  it("starts a new participant session without retaining prior task or summary state", () => {
    const dom = completeAssistedTaskForTest();
    const { document } = dom.window;
    selectAllSurveyResponses(document);
    getElement<HTMLButtonElement>(document, "build-summary").click();
    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).not.toBe("");

    fillInput(document, "participant-code", "P02");
    getElement<HTMLButtonElement>(document, "start-session").click();

    expect(
      getElement<HTMLInputElement>(document, "participant-code").value,
    ).toBe("P02");
    expect(getElement<HTMLElement>(document, "manual-task")).toBeVisible();
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
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => input.value === ""),
    ).toBe(true);
    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).toBe("");
    expect(
      getElement<HTMLElement>(document, "manual-result"),
    ).toBeEmptyDOMElement();
    expect(
      getElement<HTMLElement>(document, "assisted-result"),
    ).toBeEmptyDOMElement();
    expect(
      getElement<HTMLButtonElement>(document, "start-assisted-task"),
    ).toBeDisabled();
  });

  it("starts task A with seventeen empty fields and blocks task B until task A is complete", () => {
    const { window } = createResearchDom();
    const { document } = window;

    fillInput(document, "participant-code", "P01");
    getElement<HTMLButtonElement>(document, "start-session").click();
    getElement<HTMLButtonElement>(document, "start-manual-task").click();

    const manualInputs =
      document.querySelectorAll<HTMLInputElement>("#manual-form input");
    expect(manualInputs).toHaveLength(17);
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

    fillInputs(document, MANUAL_INPUT_VALUES);
    fillInput(document, "manual-certificate-issuer", "");
    fillInput(document, "manual-language-registration-number", "WRONG");

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

  it("groups task B into four available, seven review, five unavailable, and one sensitive field", () => {
    const { document } = startAssistedTaskForTest().window;
    const reviewInputs = document.querySelectorAll<HTMLInputElement>(
      "#autofill-review input[data-review-key]",
    );
    const inputsByStatus = {
      available: readReviewInputs(document, "is-available"),
      review: readReviewInputs(document, "is-review"),
      unavailable: readReviewInputs(document, "is-unavailable"),
      sensitive: readReviewInputs(document, "is-sensitive"),
    };

    expect(reviewInputs).toHaveLength(17);
    Object.entries(inputsByStatus).forEach(([status, inputs]) => {
      expect(inputs.map((input) => input.dataset.reviewKey)).toEqual(
        EXPECTED_REVIEW_KEYS[status as keyof typeof EXPECTED_REVIEW_KEYS],
      );
    });
    expect(
      inputsByStatus.available.every(
        (input) => input.checked && !input.disabled,
      ),
    ).toBe(true);
    expect(
      [...inputsByStatus.review, ...inputsByStatus.unavailable].every(
        (input) => !input.checked && input.disabled,
      ),
    ).toBe(true);
    expect(
      inputsByStatus.sensitive.every(
        (input) => !input.checked && input.disabled,
      ),
    ).toBe(true);
    expect(
      [...reviewInputs]
        .filter((input) => input.checked)
        .map((input) => input.dataset.reviewKey),
    ).toEqual(EXPECTED_REVIEW_KEYS.available);
    expect(document.querySelectorAll("#assisted-form input")).toHaveLength(17);
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => input.disabled),
    ).toBe(true);

    Object.entries(inputsByStatus).forEach(([status, inputs]) => {
      inputs.forEach((input) => {
        const card = input.closest(".review-card");
        const key = input.dataset
          .reviewKey as keyof typeof EXPECTED_REVIEW_VALUES;
        expect(
          normalizeText(card?.querySelector(".review-status")?.textContent),
        ).toBe(
          EXPECTED_STATUS_LABELS[status as keyof typeof EXPECTED_STATUS_LABELS],
        );
        expect(
          normalizeText(card?.querySelector(".review-value")?.textContent),
        ).toBe(EXPECTED_REVIEW_VALUES[key]);
        if (status === "review") {
          expect(card?.querySelector(".review-reason")).toHaveTextContent(
            "직접 입력",
          );
        }
        if (status === "unavailable") {
          expect(card?.querySelector(".review-reason")).toHaveTextContent(
            "프로필에 값이 없어",
          );
          expect(card?.querySelector(".review-reason")).toHaveTextContent(
            "직접 찾아 입력",
          );
        }
      });
    });

    expect(
      getElement<HTMLElement>(document, "sensitive-status"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );
    expect(
      getElement<HTMLElement>(document, "autofill-review"),
    ).toHaveTextContent("프로필에 값이 없어");
  });

  it("re-hides the sensitive value and restores review defaults when task B restarts", () => {
    const { document } = startAssistedTaskForTest().window;
    getElement<HTMLButtonElement>(document, "reveal-sensitive").click();
    getElement<HTMLInputElement>(document, "review-veteran-status").checked =
      true;
    fillInputs(document, ASSISTED_DIRECT_INPUT_VALUES);

    getElement<HTMLButtonElement>(document, "start-assisted-task").click();

    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).not.toHaveClass("is-revealed");
    expect(
      getElement<HTMLElement>(document, "sensitive-status"),
    ).not.toHaveClass("is-revealed");
    expect(
      getElement<HTMLInputElement>(document, "review-veteran-status"),
    ).toBeDisabled();
    expect(
      getElement<HTMLInputElement>(document, "review-veteran-status"),
    ).not.toBeChecked();
    expect(
      getElement<HTMLInputElement>(document, "review-email"),
    ).toBeChecked();
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => input.disabled),
    ).toBe(true);
  });

  it("clears the previous survey and summary when task B restarts", () => {
    const { document } = completeAssistedTaskForTest().window;
    selectAllSurveyResponses(document);
    getElement<HTMLButtonElement>(document, "build-summary").click();

    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).not.toBe("");
    expect(
      getElement<HTMLButtonElement>(document, "copy-summary"),
    ).toBeEnabled();

    getElement<HTMLButtonElement>(document, "start-assisted-task").click();

    expect(
      getElement<HTMLTextAreaElement>(document, "result-summary").value,
    ).toBe("");
    expect(
      getElement<HTMLButtonElement>(document, "copy-summary"),
    ).toBeDisabled();
    expect([
      ...document.querySelectorAll<HTMLInputElement>(
        "#post-task-survey input:checked",
      ),
    ]).toHaveLength(0);
    expect(
      getElement<HTMLElement>(document, "post-task-survey"),
    ).not.toBeVisible();
  });

  it("keeps task B values unchanged until final approval and applies only approved fields", () => {
    const { document } = startAssistedTaskForTest().window;
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );

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
    expect(
      normalizeText(
        getElement<HTMLElement>(document, "sensitive-value").textContent,
      ),
    ).toBe("비해당");
    expect(getElement<HTMLElement>(document, "sensitive-status")).toHaveClass(
      "is-revealed",
    );
    expect(html).toMatch(
      /\.sensitive-status\.is-revealed\s*{[^}]*filter:\s*none/,
    );
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );

    getElement<HTMLInputElement>(document, "review-name").checked = false;
    getElement<HTMLInputElement>(document, "review-name").dispatchEvent(
      new document.defaultView!.Event("change", { bubbles: true }),
    );
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => !input.disabled),
    ).toBe(true);

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
    expect(
      getElement<HTMLInputElement>(document, "assisted-certificate-name").value,
    ).toBe("");
    expect(
      getElement<HTMLInputElement>(document, "assisted-language").value,
    ).toBe("");
    expect(
      getElement<HTMLInputElement>(
        document,
        "assisted-language-evidence-document-path",
      ).value,
    ).toBe("");

    getElement<HTMLInputElement>(document, "review-veteran-status").checked =
      true;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();
    expect(
      getElement<HTMLInputElement>(document, "assisted-veteran-status").value,
    ).toBe("비해당");
  });

  it("requires final approval again after a review selection changes", () => {
    const dom = startAssistedTaskForTest();
    const { document, Event } = dom.window;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    const emailReview = getElement<HTMLInputElement>(document, "review-email");
    emailReview.checked = false;
    emailReview.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => input.disabled),
    ).toBe(true);
    getElement<HTMLButtonElement>(document, "complete-assisted-task").click();

    expect(
      getElement<HTMLElement>(document, "assisted-completion-status"),
    ).toHaveTextContent("먼저 검토 항목을 최종 승인하세요");
    expect(
      getElement<HTMLElement>(document, "post-task-survey"),
    ).not.toBeVisible();
  });

  it("clears deselected autofill values on reapproval without clearing direct entries", () => {
    const { document } = startAssistedTaskForTest().window;

    getElement<HTMLButtonElement>(document, "reveal-sensitive").click();
    getElement<HTMLInputElement>(document, "review-veteran-status").checked =
      true;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();
    fillInputs(document, ASSISTED_DIRECT_INPUT_VALUES);

    expect(getElement<HTMLInputElement>(document, "assisted-email").value).toBe(
      "seojun.lee@example.com",
    );
    expect(
      getElement<HTMLInputElement>(document, "assisted-veteran-status").value,
    ).toBe("비해당");

    getElement<HTMLInputElement>(document, "review-email").checked = false;
    getElement<HTMLInputElement>(document, "review-veteran-status").checked =
      false;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    expect(getElement<HTMLInputElement>(document, "assisted-email").value).toBe(
      "",
    );
    expect(
      getElement<HTMLInputElement>(document, "assisted-veteran-status").value,
    ).toBe("");
    expect(
      getElement<HTMLInputElement>(document, "assisted-university").value,
    ).toBe("새봄대학교(가상)");
    Object.entries(ASSISTED_DIRECT_INPUT_VALUES)
      .filter(([id]) => id !== "assisted-veteran-status")
      .forEach(([id, value]) =>
        expect(getElement<HTMLInputElement>(document, id).value).toBe(value),
      );
  });

  it("counts task B after approved fields and direct entries are both complete", () => {
    const { document } = startAssistedTaskForTest().window;
    getElement<HTMLButtonElement>(document, "approve-autofill").click();

    expect(readFormValues(document, "assisted-form")).toEqual(
      DEFAULT_APPROVED_ASSISTED_VALUES,
    );
    fillInputs(document, ASSISTED_DIRECT_INPUT_VALUES);
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
    fillInputs(document, ASSISTED_DIRECT_INPUT_VALUES);
    fillInput(document, "assisted-email", "wrong@example.com");
    fillInput(document, "assisted-phone", "");

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
    REDACTED_FIXTURE_VALUES.forEach((fixtureValue) =>
      expect(summary).not.toContain(fixtureValue),
    );
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
    expect(readFormValues(document, "assisted-form")).toEqual(
      EMPTY_FORM_VALUES,
    );
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>("#assisted-form input"),
      ].every((input) => input.disabled),
    ).toBe(true);
    expect(
      readReviewInputs(document, "is-available").every(
        (input) => input.checked && !input.disabled,
      ),
    ).toBe(true);
    expect(
      [
        ...readReviewInputs(document, "is-review"),
        ...readReviewInputs(document, "is-unavailable"),
        ...readReviewInputs(document, "is-sensitive"),
      ].every((input) => !input.checked && input.disabled),
    ).toBe(true);
    expect(
      getElement<HTMLElement>(document, "sensitive-value"),
    ).toHaveAttribute("aria-hidden", "true");
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
