import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReviewPlanItem } from "../../review/review-plan";
import { hyundaiWorkflowAdapter } from "./workflow";

afterEach(() => {
  document.body.replaceChildren();
});

function buttonOptionItem(profileFieldKey: string): ReviewPlanItem {
  return {
    candidateId: `field-${profileFieldKey}`,
    fieldLabel: "외국어",
    currentValue: "",
    profileValue: "fixture",
    previewValue: "fixture",
    profileEntryId: "language-test-1",
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: `field-${profileFieldKey}`,
      matchType: "MATCH",
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey,
        optionMap: { fixture: "fixture" },
        optionCodeMap: { fixture: "1" },
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    },
  };
}

describe("Hyundai language state drivers", () => {
  it("waits for the same-row exam menu after selecting a language", async () => {
    document.body.innerHTML = `
      <div class="field-group" id="target-row">
        <div class="select-wrap">
          <input type="hidden" name="foreLang" />
          <input type="button" id="foreLang_1" />
        </div>
        <div class="select-wrap">
          <input type="hidden" name="foreExamCd" />
          <input type="button" id="foreExamCd_1" disabled />
        </div>
      </div>
      <div class="field-group" id="other-row">
        <div class="select-wrap">
          <input type="hidden" name="foreExamCd" />
          <input type="button" id="foreExamCd_2" />
        </div>
      </div>
    `;
    const language = document.querySelector<HTMLInputElement>(
      "#target-row #foreLang_1",
    )!;
    const targetExam = document.querySelector<HTMLInputElement>(
      "#target-row #foreExamCd_1",
    )!;
    const otherExam = document.querySelector<HTMLInputElement>(
      "#other-row #foreExamCd_2",
    )!;
    const targetHandle = {
      elements: [language],
      candidate: { domId: "foreLang_1" },
    } as never;

    setTimeout(() => {
      otherExam.disabled = false;
      otherExam.closest(".select-wrap")!.append(
        Object.assign(document.createElement("div"), {
          className: "select-option",
          innerHTML: '<button data-code="wrong">wrong</button>',
        }),
      );
    }, 0);
    setTimeout(() => {
      targetExam.disabled = false;
      targetExam.closest(".select-wrap")!.append(
        Object.assign(document.createElement("div"), {
          className: "select-option",
          innerHTML: '<button data-code="16">OPIc</button>',
        }),
      );
    }, 1);

    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        buttonOptionItem("languages.languageTest.language"),
        targetHandle,
      ),
    ).toBe(1);
    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(document, targetHandle),
    ).resolves.toBe(true);
  });

  it("uses only the same-row direct-input action after selecting an exam", async () => {
    document.body.innerHTML = `
      <div class="field-group" id="target-row">
        <input type="hidden" name="foreExamCd" />
        <input type="button" id="foreExamCd_1" />
        <input name="acqNm" disabled />
        <input name="acqDt" disabled />
        <input name="point" disabled />
        <div class="select-wrap">
          <input type="hidden" name="grade" />
          <input type="button" id="gradeForeLang_1" class="btn-select" disabled />
        </div>
        <button class="exam_load" type="button">성적 불러오기</button>
        <button class="exam_cancle" type="button">직접입력</button>
      </div>
      <div class="field-group" id="other-row">
        <button class="exam_cancle" type="button">직접입력</button>
      </div>
    `;
    const exam = document.querySelector<HTMLInputElement>(
      "#target-row #foreExamCd_1",
    )!;
    const target = document.querySelector<HTMLButtonElement>(
      "#target-row .exam_cancle",
    )!;
    const other = document.querySelector<HTMLButtonElement>(
      "#other-row .exam_cancle",
    )!;
    const load = document.querySelector<HTMLButtonElement>(
      "#target-row .exam_load",
    )!;
    let directClicks = 0;
    let otherClicks = 0;
    let loadClicks = 0;
    target.addEventListener("click", () => {
      directClicks += 1;
      document
        .querySelectorAll<HTMLInputElement>(
          '#target-row [name="acqNm"], #target-row [name="acqDt"], #target-row [name="point"]',
        )
        .forEach((input) => {
          input.disabled = false;
        });
    });
    other.addEventListener("click", () => {
      otherClicks += 1;
    });
    load.addEventListener("click", () => {
      loadClicks += 1;
    });

    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        buttonOptionItem("languages.languageTest.testName"),
        { elements: [exam], candidate: { domId: "foreExamCd_1" } } as never,
      ),
    ).toBe(2);
    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(document, {
        elements: [exam],
        candidate: { domId: "foreExamCd_1" },
      } as never),
    ).resolves.toBe(true);
    expect(directClicks).toBe(1);
    expect(otherClicks).toBe(0);
    expect(loadClicks).toBe(0);
    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(document, {
        elements: [exam],
        candidate: { domId: "foreExamCd_1" },
      } as never),
    ).resolves.toBe(true);
    expect(directClicks).toBe(1);
    expect(
      document.querySelector<HTMLInputElement>('#target-row [name="acqNm"]')
        ?.disabled,
    ).toBe(false);
  });

  it("waits for an asynchronously enabled grade menu when direct input is absent", async () => {
    document.body.innerHTML = `
      <div class="field-group">
        <input type="hidden" name="foreExamCd" />
        <input type="button" id="foreExamCd_1" />
        <input name="acqNm" disabled /><input name="acqDt" disabled />
        <div class="select-wrap"><input type="hidden" name="grade" /><input type="button" class="btn-select" id="gradeForeLang_1" disabled /></div>
      </div>
    `;
    const exam = document.querySelector<HTMLInputElement>("#foreExamCd_1")!;
    setTimeout(() => {
      document
        .querySelectorAll<HTMLInputElement>("[name='acqNm'], [name='acqDt']")
        .forEach((input) => {
          input.disabled = false;
        });
      const grade =
        document.querySelector<HTMLInputElement>("#gradeForeLang_1")!;
      grade.disabled = false;
      grade.closest(".select-wrap")!.append(
        Object.assign(document.createElement("div"), {
          className: "select-option",
          innerHTML: '<button data-code="34">IH</button>',
        }),
      );
    }, 0);

    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(document, {
        elements: [exam],
        candidate: { domId: "foreExamCd_1" },
      } as never),
    ).resolves.toBe(true);
  });

  it("fails without clicking when the same row has ambiguous direct-input actions", async () => {
    document.body.innerHTML = `
      <div class="field-group">
        <input type="button" id="foreExamCd_1" />
        <input name="acqNm" disabled /><input name="acqDt" disabled />
        <button class="exam_cancle" type="button">직접입력</button>
        <button class="exam_cancle" type="button">직접입력</button>
      </div>
    `;
    const exam = document.querySelector<HTMLInputElement>("#foreExamCd_1")!;
    let clicks = 0;
    document
      .querySelectorAll<HTMLButtonElement>(".exam_cancle")
      .forEach((button) => {
        button.addEventListener("click", () => {
          clicks += 1;
        });
      });

    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(document, {
        elements: [exam],
        candidate: { domId: "foreExamCd_1" },
      } as never),
    ).resolves.toBe(false);
    expect(clicks).toBe(0);
  });

  it("does not click hidden or inert same-row direct-input actions", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="field-group">
        <input type="button" id="foreExamCd_1" />
        <input name="acqNm" disabled /><input name="acqDt" disabled />
        <div hidden><button class="exam_cancle" type="button">직접입력</button></div>
        <div inert><button class="exam_cancle" type="button">직접입력</button></div>
      </div>
    `;
    const exam = document.querySelector<HTMLInputElement>("#foreExamCd_1")!;
    let clicks = 0;
    document
      .querySelectorAll<HTMLButtonElement>(".exam_cancle")
      .forEach((button) => {
        button.addEventListener("click", () => {
          clicks += 1;
        });
      });
    const pending = hyundaiWorkflowAdapter.settleStateDriver?.(document, {
      elements: [exam],
      candidate: { domId: "foreExamCd_1" },
    } as never);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe(false);
    expect(clicks).toBe(0);
    vi.useRealTimers();
  });
});
