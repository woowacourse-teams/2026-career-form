import { afterEach, describe, expect, it } from "vitest";

import type { ReviewPlanItem } from "../../review/review-plan";
import { hyundaiWorkflowAdapter } from "./workflow";

afterEach(() => document.body.replaceChildren());

const LANGUAGE_KEY = "languages.languageTest.language";
const EXAM_KEY = "languages.languageTest.testName";

function item(profileFieldKey: string, id: string): ReviewPlanItem {
  return {
    candidateId: id,
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
      candidateId: id,
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

function row(index: number): string {
  return `<div class="field-group" id="row-${index}">
    <div class="select-wrap"><input type="hidden" class="js-field" name="foreLang" /><input type="button" id="foreLang_${index}" /></div>
    <div class="select-wrap"><input type="hidden" class="js-field" name="foreExamCd" /><input type="button" id="foreExamCd_${index}" /></div>
  </div>`;
}

function failureGroup(id: string, profileFieldKey: string) {
  const trigger = document.querySelector<HTMLInputElement>(`#${id}`)!;
  const candidateId = `field-${id}`;
  return hyundaiWorkflowAdapter.stateDriverFailureGroup?.(
    item(profileFieldKey, candidateId),
    {
      candidateId,
      elements: [trigger],
      candidate: { candidateId, domId: id, element: "input", control: "text" },
    } as never,
  );
}

describe("Hyundai language row failure groups", () => {
  it.each([
    ["foreLang_1", LANGUAGE_KEY, "row-1"],
    ["foreExamCd_1", EXAM_KEY, "row-1"],
    ["foreLang_2", LANGUAGE_KEY, "row-2"],
    ["foreExamCd_2", EXAM_KEY, "row-2"],
  ])("isolates %s to its own language row", (id, key, rowId) => {
    document.body.innerHTML = row(1) + row(2);
    expect(failureGroup(id, key)).toBe(document.getElementById(rowId));
  });

  it("keeps stopping when one container holds more than one language row", () => {
    const flatRow = (index: number) =>
      `<input type="hidden" name="foreLang" /><input type="button" id="foreLang_${index}" /><input type="hidden" name="foreExamCd" /><input type="button" id="foreExamCd_${index}" />`;
    document.body.innerHTML = `<div class="field-group">${flatRow(1)}${flatRow(2)}</div>`;
    expect(failureGroup("foreLang_1", LANGUAGE_KEY)).toBeUndefined();
    expect(failureGroup("foreExamCd_1", EXAM_KEY)).toBeUndefined();
  });

  it("keeps stopping when the driver is outside every field-group", () => {
    document.body.innerHTML = `<div class="select-wrap"><input type="hidden" name="foreLang" /><input type="button" id="foreLang_1" /></div>`;
    expect(failureGroup("foreLang_1", LANGUAGE_KEY)).toBeUndefined();
  });

  it("keeps stopping when the row does not own both language drivers", () => {
    document.body.innerHTML = `<div class="field-group"><div class="select-wrap"><input type="hidden" name="foreLang" /><input type="button" id="foreLang_1" /></div></div>`;
    expect(failureGroup("foreLang_1", LANGUAGE_KEY)).toBeUndefined();
  });

  it("keeps stopping for a different profile field in the same row", () => {
    document.body.innerHTML = row(1);
    expect(failureGroup("foreLang_1", EXAM_KEY)).toBeUndefined();
  });

  it("does not isolate the nationality driver", () => {
    document.body.innerHTML = `<div class="field-group"><input type="button" id="nationCd1Nm" /></div>`;
    expect(
      failureGroup("nationCd1Nm", "personal.personal.nationality"),
    ).toBeUndefined();
  });
});
