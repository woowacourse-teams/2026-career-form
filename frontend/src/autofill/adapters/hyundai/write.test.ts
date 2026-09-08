import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { hyundaiWriteAdapter } from "./write";

const GPA_SCALES = [
  ["4.0", "4"],
  ["4.3", "4.3"],
  ["4.5", "4.5"],
  ["100", "100"],
] as const;

function gpaItem(display: string, code: string): ReviewPlanItem {
  return {
    candidateId: "hyundai-gpa-scale-1",
    fieldLabel: "만점기준",
    currentValue: "",
    profileValue: display,
    previewValue: display,
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: "hyundai-gpa-scale-1",
      matchType: "MATCH",
      valueBinding: {
        type: "BUTTON_OPTION",
        profileFieldKey: "education.university.gpaScale",
        optionMap: { [display]: display },
        optionCodeMap: { [display]: code },
      },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
    },
  };
}

function renderGpa(
  display: string,
  code: string,
  rowNumber = 1,
  itemIndex = 0,
): {
  trigger: HTMLInputElement;
  resultHidden: HTMLInputElement;
  directHidden: HTMLInputElement;
  otherHidden: HTMLInputElement;
  handle: FieldCandidateHandle;
  clicks: () => number;
} {
  document.body.innerHTML = `
    <div class="field-content">
      <div class="field-group">
        <div class="field">
          <div class="select-wrap">
            <input type="hidden" class="js-field" name="directRcdperf" />
            <input type="hidden" class="js-field" name="rcdPerf" />
            <input type="button" id="rcdPerf_${rowNumber}" data-codegb="0017" />
            <div class="select-option">
              <button type="button" data-code="${code}">${display}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="field-content" id="other-row">
      <div class="select-wrap">
        <input type="hidden" class="js-field" name="rcdPerf" value="OTHER" />
        <input type="button" id="rcdPerf_99" data-codegb="0017" value="기존값" />
      </div>
    </div>
  `;
  const trigger = document.querySelector<HTMLInputElement>(
    `#rcdPerf_${rowNumber}`,
  )!;
  const resultHidden = document.querySelector<HTMLInputElement>(
    "input[name='rcdPerf']",
  )!;
  const directHidden = document.querySelector<HTMLInputElement>(
    "input[name='directRcdperf']",
  )!;
  const otherHidden = document.querySelector<HTMLInputElement>(
    "#other-row input[name='rcdPerf']",
  )!;
  const option = document.querySelector<HTMLButtonElement>(
    ".select-option button",
  )!;
  Object.defineProperty(option, "offsetParent", { value: document.body });
  let selectionClicks = 0;
  option.addEventListener("click", () => {
    selectionClicks += 1;
    trigger.value = display;
    resultHidden.value = code;
  });
  return {
    trigger,
    resultHidden,
    directHidden,
    otherHidden,
    handle: {
      kind: "field",
      candidateId: "hyundai-gpa-scale-1",
      sectionId: "academic",
      itemId: "university-1",
      itemIndex,
      itemGroupId: "educationuniversity",
      signature: "gpa-scale-1",
      candidate: {
        candidateId: "hyundai-gpa-scale-1",
        visibility: "visible",
        displayName: "만점기준",
        domId: `rcdPerf_${rowNumber}`,
        element: "input",
        control: "button",
      },
      elements: [trigger],
      optionElements: new Map(),
    },
    clicks: () => selectionClicks,
  };
}

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("Hyundai GPA scale button", () => {
  it.each(GPA_SCALES)(
    "writes display %s and exact hidden code %s without touching direct input",
    (display, code) => {
      const rendered = renderGpa(display, code);

      expect(
        hyundaiWriteAdapter.tryWrite(rendered.handle, gpaItem(display, code)),
      ).toEqual({ handled: true, written: true });
      expect(rendered.trigger.value).toBe(display);
      expect(rendered.resultHidden.value).toBe(code);
      expect(rendered.directHidden.value).toBe("");
      expect(rendered.otherHidden.value).toBe("OTHER");
      expect(rendered.clicks()).toBe(1);
    },
  );

  it("preserves a different existing GPA scale", () => {
    const rendered = renderGpa("4.5", "4.5");
    rendered.trigger.value = "4.3";
    rendered.resultHidden.value = "4.3";
    const item = gpaItem("4.5", "4.5");
    item.currentValue = "4.3";

    expect(hyundaiWriteAdapter.tryWrite(rendered.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(rendered.trigger.value).toBe("4.3");
    expect(rendered.resultHidden.value).toBe("4.3");
    expect(rendered.clicks()).toBe(0);
  });

  it("binds the first university profile entry to its physical education row", () => {
    const rendered = renderGpa("4.5", "4.5", 2, 0);

    expect(
      hyundaiWriteAdapter.tryWrite(rendered.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: true });
    expect(rendered.resultHidden.value).toBe("4.5");
    expect(rendered.directHidden.value).toBe("");
  });

  it("rejects an unsupported GPA code and a non-university row", () => {
    const unsupported = renderGpa("5.0", "5");
    expect(
      hyundaiWriteAdapter.tryWrite(unsupported.handle, gpaItem("5.0", "5")),
    ).toEqual({ handled: true, written: false });
    expect(unsupported.clicks()).toBe(0);

    const wrongGroup = renderGpa("4.5", "4.5");
    wrongGroup.handle.itemGroupId = "educationgraduateschool";
    expect(
      hyundaiWriteAdapter.tryWrite(wrongGroup.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(wrongGroup.clicks()).toBe(0);
  });

  it("rejects a mismatched candidate identity", () => {
    const mismatched = renderGpa("4.5", "4.5");
    mismatched.handle.candidate.domId = "rcdPerf_2";
    expect(
      hyundaiWriteAdapter.tryWrite(mismatched.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(mismatched.clicks()).toBe(0);
  });

  it("rejects a mismatched live GPA code group", () => {
    const wrongCodeGroup = renderGpa("4.5", "4.5");
    wrongCodeGroup.trigger.dataset.codegb = "9999";
    expect(
      hyundaiWriteAdapter.tryWrite(
        wrongCodeGroup.handle,
        gpaItem("4.5", "4.5"),
      ),
    ).toEqual({ handled: true, written: false });
    expect(wrongCodeGroup.clicks()).toBe(0);
  });

  it("rejects duplicate same-row GPA hidden targets", () => {
    const rendered = renderGpa("4.5", "4.5");
    const duplicate = document.createElement("input");
    duplicate.type = "hidden";
    duplicate.className = "js-field";
    duplicate.name = "rcdPerf";
    rendered.trigger.closest(".select-wrap")!.prepend(duplicate);

    expect(
      hyundaiWriteAdapter.tryWrite(rendered.handle, gpaItem("4.5", "4.5")),
    ).toEqual({ handled: true, written: false });
    expect(rendered.clicks()).toBe(0);
  });
});
