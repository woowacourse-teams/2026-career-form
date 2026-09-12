import { afterEach, describe, expect, it } from "vitest";

import { hyundaiWriteAdapter } from "./write";
import {
  buttonItem,
  gpaItem,
  renderExactButton,
} from "./write-military-veteran.test-fixtures";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Hyundai military and veteran buttons", () => {
  it.each([
    {
      id: "milCd",
      codegb: "0004",
      fieldKey: "military.military.militaryStatus",
      display: "필",
      code: "1",
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    },
    {
      id: "milDitinc",
      codegb: "0005",
      fieldKey: "military.military.militaryBranch",
      display: "육군",
      code: "1",
    },
    {
      id: "milRank",
      codegb: "0006",
      fieldKey: "military.military.militaryRank",
      display: "병장",
      code: "41",
    },
    {
      id: "milExcptCd",
      codegb: "0094",
      fieldKey: "military.military.exemptionReason",
      display: "신체문제",
      code: "01",
    },
    {
      id: "branchYn",
      codegb: "1502",
      fieldKey: "veteran.veteran.veteranStatus",
      display: "예",
      code: "Y",
      enabled: "branchRel,branchSupplyYn,branchAddPoint,branchNo",
      disabled: "",
      valid: "branchRel,branchAddPoint,branchNo",
    },
    {
      id: "branchRel",
      codegb: "0007",
      fieldKey: "veteran.veteran.veteranRelation",
      display: "대상(본인)",
      code: "1",
    },
  ])(
    "writes the exact $id display and hidden code",
    ({ fieldKey, ...spec }) => {
      const rendered = renderExactButton(spec);
      const item = buttonItem(
        rendered.handle.candidateId,
        fieldKey,
        spec.display,
        spec.code,
      );

      expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
        handled: true,
        written: true,
      });
      expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
        handled: true,
        written: true,
      });
      expect(rendered.trigger.value).toBe(spec.display);
      expect(rendered.hidden.value).toBe(spec.code);
      expect(rendered.optionClicks()).toBe(1);
      expect(rendered.triggerClicks()).toBe(1);
    },
  );

  it("does not click an already matching military status", () => {
    const rendered = renderExactButton({
      id: "milCd",
      codegb: "0004",
      display: "필",
      code: "1",
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    });
    rendered.trigger.value = "필";
    rendered.hidden.value = "1";
    const item = buttonItem(
      rendered.handle.candidateId,
      "military.military.militaryStatus",
      "필",
      "1",
    );
    item.currentValue = "필";

    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(rendered.triggerClicks()).toBe(0);
    expect(rendered.optionClicks()).toBe(0);
  });

  it("does not click an already matching veteran status", () => {
    const rendered = renderExactButton({
      id: "branchYn",
      codegb: "1502",
      display: "예",
      code: "Y",
      enabled: "branchRel,branchSupplyYn,branchAddPoint,branchNo",
      disabled: "",
      valid: "branchRel,branchAddPoint,branchNo",
    });
    rendered.trigger.value = "예";
    rendered.hidden.value = "Y";
    const item = buttonItem(
      rendered.handle.candidateId,
      "veteran.veteran.veteranStatus",
      "예",
      "Y",
    );
    item.currentValue = "예";

    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(rendered.triggerClicks()).toBe(0);
    expect(rendered.optionClicks()).toBe(0);
  });

  it("rejects duplicate exact options before opening the military menu", () => {
    const rendered = renderExactButton({
      id: "milCd",
      codegb: "0004",
      display: "필",
      code: "1",
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    });
    const duplicate = rendered.option.cloneNode(true);
    rendered.option.after(duplicate);

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "military.military.militaryStatus",
          "필",
          "1",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.triggerClicks()).toBe(0);
    expect(rendered.optionClicks()).toBe(0);
  });

  it("blocks a military detail when the selected driver did not finish its state transition", () => {
    const rendered = renderExactButton({
      id: "milRank",
      codegb: "0006",
      display: "병장",
      code: "41",
    });
    document.querySelector<HTMLInputElement>("#milExcptCd")!.disabled = false;

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "military.military.militaryRank",
          "병장",
          "41",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it("blocks a military detail when an optional specialty control remains stale", () => {
    const rendered = renderExactButton({
      id: "milRank",
      codegb: "0006",
      display: "병장",
      code: "41",
    });
    const specialty = document.createElement("input");
    specialty.id = "milSpeNm";
    specialty.disabled = true;
    document.querySelector("article#etc")!.append(specialty);

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "military.military.militaryRank",
          "병장",
          "41",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it.each([
    ["a different existing display", "미필", "2", "미필"],
    ["a mismatched hidden code", "필", "2", "필"],
    ["a newly appeared opposite selection", "미필", "2", ""],
  ])("preserves %s", (_description, display, hiddenCode, currentValue) => {
    const rendered = renderExactButton({
      id: "milCd",
      codegb: "0004",
      display: "필",
      code: "1",
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    });
    rendered.trigger.value = display;
    rendered.hidden.value = hiddenCode;
    const item = buttonItem(
      rendered.handle.candidateId,
      "military.military.militaryStatus",
      "필",
      "1",
    );
    item.currentValue = currentValue;

    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(rendered.trigger.value).toBe(display);
    expect(rendered.hidden.value).toBe(hiddenCode);
    expect(rendered.triggerClicks()).toBe(0);
    expect(rendered.optionClicks()).toBe(0);
  });

  it("refuses an injury status whose observed code does not match the binding", () => {
    const rendered = renderExactButton({
      id: "injuryYn",
      codegb: "1503",
      display: "예",
      code: "Y",
      enabled: "injuryGrade,injuryType,injuryTypeNm,injuryCont",
      disabled: "",
    });

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "disability.disability.disabilityStatus",
          "예",
          "N",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it("blocks a disabled disability grade until injury status is settled", () => {
    const rendered = renderExactButton({
      id: "injuryGrade",
      codegb: "0164",
      display: "심한 장애인",
      code: "10",
    });
    rendered.trigger.disabled = true;

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "disability.disability.disabilityGrade",
          "심한 장애인",
          "10",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it.each(["injuryType", "injuryCont"])(
    "blocks a disability grade when observed %s is absent",
    (missingId) => {
      const rendered = renderExactButton({
        id: "injuryGrade",
        codegb: "0164",
        display: "심한 장애인",
        code: "10",
      });
      document.querySelector(`#${missingId}`)!.remove();

      expect(
        hyundaiWriteAdapter.tryWrite(
          rendered.handle,
          buttonItem(
            rendered.handle.candidateId,
            "disability.disability.disabilityGrade",
            "심한 장애인",
            "10",
          ),
        ),
      ).toEqual({ handled: true, written: false });
      expect(rendered.optionClicks()).toBe(0);
    },
  );

  it.each([
    [
      "wrong scope",
      (): void => {
        document.querySelector("article")!.id = "foreign";
      },
    ],
    [
      "wrong code group",
      (): void => {
        document.querySelector<HTMLInputElement>("#injuryYn")!.dataset.codegb =
          "9999";
      },
    ],
    [
      "unexpected name",
      (): void => {
        document.querySelector<HTMLInputElement>("#injuryYn")!.name =
          "injuryYn";
      },
    ],
    [
      "duplicate hidden target",
      (): void =>
        document.querySelector("#injuryYn")!.before(
          Object.assign(document.createElement("input"), {
            type: "hidden",
            name: "injuryYn",
          }),
        ),
    ],
  ] as const)("refuses an injury status with %s", (_description, mutate) => {
    const rendered = renderExactButton({
      id: "injuryYn",
      codegb: "1503",
      display: "예",
      code: "Y",
      enabled: "injuryGrade,injuryType,injuryTypeNm,injuryCont",
      disabled: "",
    });
    mutate();

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "disability.disability.disabilityStatus",
          "예",
          "Y",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it("preserves an existing opposite injury status", () => {
    const rendered = renderExactButton({
      id: "injuryYn",
      codegb: "1503",
      display: "예",
      code: "Y",
      enabled: "injuryGrade,injuryType,injuryTypeNm,injuryCont",
      disabled: "",
    });
    rendered.trigger.value = "아니오";
    rendered.hidden.value = "N";

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "disability.disability.disabilityStatus",
          "예",
          "Y",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });

  it.each([
    [
      "wrong section",
      (): void => {
        document.querySelector("article")!.setAttribute("id", "foreign");
      },
    ],
    [
      "wrong code group",
      (): void => {
        document.querySelector<HTMLInputElement>("#milCd")!.dataset.codegb =
          "9999";
      },
    ],
    [
      "duplicate hidden",
      (): void =>
        document.querySelector(".select-wrap")!.prepend(
          Object.assign(document.createElement("input"), {
            type: "hidden",
            name: "milCd",
          }),
        ),
    ],
    [
      "wrong transition contract",
      (): void => {
        document.querySelector<HTMLButtonElement>(
          ".select-option button",
        )!.dataset.valid = "milStartDt";
      },
    ],
  ] as const)("refuses a military status with %s", (_description, mutate) => {
    const rendered = renderExactButton({
      id: "milCd",
      codegb: "0004",
      display: "필",
      code: "1",
      enabled: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
      disabled: "milExcptCd",
      valid: "milStartDt,milEndDt,milRank,milDitinc,milSpeNm",
    });
    mutate();

    expect(
      hyundaiWriteAdapter.tryWrite(
        rendered.handle,
        buttonItem(
          rendered.handle.candidateId,
          "military.military.militaryStatus",
          "필",
          "1",
        ),
      ),
    ).toEqual({ handled: true, written: false });
    expect(rendered.optionClicks()).toBe(0);
  });
});

describe("Hyundai military and veteran text contracts", () => {
  it.each([
    ["milStartDt", "military.military.serviceStartDate", "2022-03"],
    ["milEndDt", "military.military.serviceEndDate", "2023-09"],
  ] as const)("rejects a malformed %s date widget", (id, fieldKey, value) => {
    document.body.innerHTML = `<article id="etc" class="field-form-apply"><div class="field calendar col-medium js-date-start js-required"><input class="js-field" type="text" id="${id}" name="${id}" maxlength="7" data-date-format="yyyy-mm" data-min-view="months" data-view="days" /></div></article>`;
    const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
    const candidateId = `field-${id}`;
    const item = {
      ...gpaItem(value, value),
      candidateId,
      profileValue: value,
      analysis: {
        ...gpaItem(value, value).analysis!,
        candidateId,
        valueBinding: {
          type: "DERIVED" as const,
          recipe: "YEAR_MONTH" as const,
          profileFieldKey: fieldKey,
        },
        writePlan: { command: "SET_TEXT" as const },
      },
    };

    expect(
      hyundaiWriteAdapter.tryWrite(
        {
          kind: "field",
          candidateId,
          sectionId: "etc",
          signature: id,
          candidate: {
            candidateId,
            visibility: "visible",
            domId: id,
            domName: id,
            element: "input",
            control: "text",
          },
          elements: [input],
          optionElements: new Map(),
        },
        item,
      ),
    ).toEqual({ handled: true, written: false });
  });

  it.each([
    ["non-digits", "VET-001"],
    ["more than ten digits", "12345678901"],
  ])("blocks a veteran number with %s", (_description, value) => {
    document.body.innerHTML = `<article id="etc" class="field-form-apply"><div class="field col-medium js-required"><input class="js-field" type="text" id="branchNo" name="branchNo" maxlength="10" data-parsley-type="digits" /></div></article>`;
    const input = document.querySelector<HTMLInputElement>("#branchNo")!;
    const candidateId = "field-branchNo";
    const item = {
      ...gpaItem(value, value),
      candidateId,
      profileValue: value,
      analysis: {
        ...gpaItem(value, value).analysis!,
        candidateId,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: "veteran.veteran.veteranNumber",
        },
        writePlan: { command: "SET_TEXT" as const },
      },
    };

    expect(
      hyundaiWriteAdapter.tryWrite(
        {
          kind: "field",
          candidateId,
          sectionId: "etc",
          signature: "branchNo",
          candidate: {
            candidateId,
            visibility: "visible",
            domId: "branchNo",
            domName: "branchNo",
            element: "input",
            control: "text",
          },
          elements: [input],
          optionElements: new Map(),
        },
        item,
      ),
    ).toEqual({ handled: true, written: false });
  });
});
