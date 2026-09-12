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

function searchItem(
  candidateId: string,
  profileFieldKey: string,
): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: "전공",
    currentValue: "",
    profileValue: "fixture",
    previewValue: "fixture",
    profileEntryId: "university-1",
    itemIndex: 0,
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId,
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey },
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
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

describe("Hyundai university search failure groups", () => {
  it.each([
    ["dblMajorNm", "dblMajor", "education.university.additionalMajorName"],
    ["minorNm", "minor", "education.university.minorName"],
  ])("isolates only the %s search field", (domName, hiddenName, fieldKey) => {
    document.body.innerHTML = `<div class="field search"><input type="hidden" name="${hiddenName}"><input type="text" id="${domName}_1" name="${domName}" data-auto-type="basic" data-auto-api="0200" data-auto-params="0015"><ul class="search-result-list"></ul></div>`;
    const field = document.querySelector<HTMLElement>(".field.search")!;
    const display = field.querySelector<HTMLInputElement>(`#${domName}_1`)!;
    const candidateId = `field-${domName}`;
    const handle = {
      candidateId,
      elements: [display],
      candidate: {
        candidateId,
        domId: `${domName}_1`,
        domName,
        element: "input",
        control: "text",
      },
      itemGroupId: "educationuniversity",
    } as never;

    expect(
      hyundaiWorkflowAdapter.stateDriverFailureGroup?.(
        searchItem(candidateId, fieldKey),
        handle,
      ),
    ).toBe(field);
  });

  it.each([
    ["schNm", "schCd", "education.university.schoolName"],
    ["majorNm", "major", "education.university.majorName"],
  ])(
    "does not broaden failure isolation to %s",
    (domName, hiddenName, fieldKey) => {
      document.body.innerHTML = `<div class="field search"><input type="hidden" name="${hiddenName}"><input type="text" id="${domName}_1" name="${domName}" data-auto-type="basic" data-auto-api="0200" data-auto-params="0015"><ul class="search-result-list"></ul></div>`;
      const display = document.querySelector<HTMLInputElement>(
        `#${domName}_1`,
      )!;
      const candidateId = `field-${domName}`;

      expect(
        hyundaiWorkflowAdapter.stateDriverFailureGroup?.(
          searchItem(candidateId, fieldKey),
          {
            candidateId,
            elements: [display],
            candidate: {
              candidateId,
              domId: `${domName}_1`,
              domName,
              element: "input",
              control: "text",
            },
            itemGroupId: "educationuniversity",
          } as never,
        ),
      ).toBeUndefined();
    },
  );
});

describe("Hyundai military and veteran state drivers", () => {
  function driverHandle(id: "milCd" | "branchYn") {
    const trigger = document.querySelector<HTMLInputElement>(`#${id}`)!;
    const candidateId = `field-${id}`;
    return {
      kind: "field",
      candidateId,
      sectionId: "etc",
      signature: id,
      candidate: {
        candidateId,
        domId: id,
        element: "input",
        control: "button",
      },
      elements: [trigger],
      optionElements: new Map(),
    } as never;
  }

  function stateDriverItem(
    id: "milCd" | "branchYn",
    profileFieldKey: string,
  ): ReviewPlanItem {
    const item = buttonOptionItem(profileFieldKey);
    item.candidateId = `field-${id}`;
    item.analysis = {
      ...item.analysis!,
      candidateId: `field-${id}`,
    };
    return item;
  }

  function renderConditionalFields() {
    document.body.innerHTML = `
      <article id="etc" class="field-form-apply">
        <div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="milCd"><input type="button" class="btn-select" id="milCd" data-codegb="0004"></div></div>
        <input id="milStartDt" name="milStartDt" required>
        <input id="milEndDt" name="milEndDt" required>
        <input type="button" id="milRank" required>
        <input type="button" id="milDitinc" required>
        <input type="button" id="milExcptCd" required>
        <div class="field"><div class="select-wrap"><input type="hidden" class="js-field" name="branchYn"><input type="button" class="btn-select" id="branchYn" data-codegb="1502"></div></div>
        <input type="button" id="branchRel" required>
        <input type="checkbox" id="branchSupplyYn">
        <input type="button" id="branchAddPoint" required>
        <input id="branchNo" name="branchNo" required>
      </article>`;
    return {
      militaryHidden: document.querySelector<HTMLInputElement>(
        "input[type='hidden'][name='milCd']",
      )!,
      veteranHidden: document.querySelector<HTMLInputElement>(
        "input[type='hidden'][name='branchYn']",
      )!,
    };
  }

  it.each([
    ["milCd", "military.military.militaryStatus"],
    ["branchYn", "veteran.veteran.veteranStatus"],
  ] as const)("runs %s before dependent fields", (id, fieldKey) => {
    renderConditionalFields();
    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        stateDriverItem(id, fieldKey),
        driverHandle(id),
      ),
    ).toBe(1);
  });

  it("rejects a similar military driver outside article#etc", () => {
    renderConditionalFields();
    document.querySelector("article")!.id = "foreign";
    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        stateDriverItem("milCd", "military.military.militaryStatus"),
        driverHandle("milCd"),
      ),
    ).toBeUndefined();
  });

  it("settles 필 only after the four supported details are enabled and required", async () => {
    const { militaryHidden } = renderConditionalFields();
    militaryHidden.value = "1";
    document.querySelector<HTMLInputElement>("#milCd")!.value = "필";
    document.querySelector<HTMLInputElement>("#milExcptCd")!.disabled = true;
    document.querySelector<HTMLInputElement>("#milExcptCd")!.required = false;

    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(
        document,
        driverHandle("milCd"),
      ),
    ).resolves.toBe(true);
  });

  it("does not settle 미필 while stale detail fields remain enabled", async () => {
    vi.useFakeTimers();
    const { militaryHidden } = renderConditionalFields();
    militaryHidden.value = "2";
    document.querySelector<HTMLInputElement>("#milCd")!.value = "미필";
    const pending = hyundaiWorkflowAdapter.settleStateDriver?.(
      document,
      driverHandle("milCd"),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("settles 보훈 대상 only after supported and unsupported dependent controls reach their exact state", async () => {
    const { veteranHidden } = renderConditionalFields();
    veteranHidden.value = "Y";
    document.querySelector<HTMLInputElement>("#branchYn")!.value = "예";

    await expect(
      hyundaiWorkflowAdapter.settleStateDriver?.(
        document,
        driverHandle("branchYn"),
      ),
    ).resolves.toBe(true);
  });

  it("does not settle 보훈 비대상 while any dependent control stays enabled", async () => {
    vi.useFakeTimers();
    const { veteranHidden } = renderConditionalFields();
    veteranHidden.value = "N";
    document.querySelector<HTMLInputElement>("#branchYn")!.value = "아니오";
    const pending = hyundaiWorkflowAdapter.settleStateDriver?.(
      document,
      driverHandle("branchYn"),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe("Hyundai academic location state drivers", () => {
  it("runs country before city so the city menu is reanalyzed", () => {
    const item = buttonOptionItem("education.university.schoolRegion");
    const locationHandle = (id: "locNation_1" | "locCity_1") => ({
      candidateId: item.candidateId,
      itemGroupId: "educationuniversity",
      itemIndex: 0,
      elements: [],
      candidate: { domId: id, domName: id.replace(/_[0-9]+$/, "") },
    });
    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        item,
        locationHandle("locNation_1") as never,
      ),
    ).toBe(2);
    expect(
      hyundaiWorkflowAdapter.stateDriverStage?.(
        item,
        locationHandle("locCity_1") as never,
      ),
    ).toBe(3);
  });
});

describe("Hyundai location failure isolation", () => {
  it("defers only an exact location select-wrap when its menu is unavailable", () => {
    document.body.innerHTML = `<article id="academic" class="field-form-apply"><div class="field-content"><div class="select-wrap"><input class="btn-select js-target btn-new-loc locNa" type="text" id="locCity_1" data-target-codegb="0013" data-refer="locNation" data-attr1="KR"><input class="js-field" type="hidden" name="locCity"></div></div></article>`;
    const trigger = document.querySelector<HTMLInputElement>("#locCity_1")!;
    const item = buttonOptionItem("education.university.schoolRegion");
    const group = hyundaiWorkflowAdapter.stateDriverFailureGroup?.(item, {
      candidateId: item.candidateId,
      itemGroupId: "educationuniversity",
      itemIndex: 0,
      elements: [trigger],
      candidate: { domId: "locCity_1", element: "input", control: "text" },
    } as never);
    expect(group).toBe(trigger.closest(".select-wrap"));
    expect(group).not.toBe(trigger.closest(".field-content"));
  });
});
