import { afterEach, describe, expect, it } from "vitest";

import type { ReviewPlanItem } from "../../review/review-plan";
import { getWorkflowAdapter } from "../workflow";

const adapter = getWorkflowAdapter("www.skcareers.com");

afterEach(() => document.body.replaceChildren());

function item(id: string, profileFieldKey: string): ReviewPlanItem {
  return {
    candidateId: id,
    fieldLabel: "언어",
    currentValue: "",
    profileValue: "English",
    previewValue: "English",
    profileEntryId: "language-test-1",
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "fixture",
    analysis: {
      candidateId: id,
      matchType: "MATCH",
      valueBinding: { type: "DIRECT", profileFieldKey },
      autofillPolicy: "CONDITIONAL",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    },
  };
}

function examRow(id: string): string {
  return `<div class="form-item-group langExam-Item" id="${id}">
    <select name="lngLanguageType"><option value="">언어</option><option value="en">English</option></select>
    <input name="lngExamName" />
  </div>`;
}

function failureGroup(
  index: number,
  profileFieldKey = "languages.languageTest.language",
) {
  const select = document.querySelectorAll<HTMLSelectElement>(
    "[name=lngLanguageType]",
  )[index]!;
  const candidateId = `field-lang-${index}`;
  return adapter.stateDriverFailureGroup?.(item(candidateId, profileFieldKey), {
    candidateId,
    elements: [select],
    candidate: { candidateId, domName: "lngLanguageType", element: "select" },
    itemGroupId: "languageTest",
    itemIndex: index,
  } as never);
}

describe("SK language row failure groups", () => {
  it.each([
    [0, "row-a"],
    [1, "row-b"],
  ])("isolates language select %i to its own exam row", (index, rowId) => {
    document.body.innerHTML = `<div class="apply-form-box">${examRow("row-a")}${examRow("row-b")}</div>`;
    expect(failureGroup(index)).toBe(document.getElementById(rowId));
  });

  it("keeps stopping when one exam container holds two language selects", () => {
    document.body.innerHTML = `<div class="form-item-group langExam-Item"><select name="lngLanguageType"></select><select name="lngLanguageType"></select></div>`;
    expect(failureGroup(0)).toBeUndefined();
  });

  it("keeps stopping when the select is outside an exam row", () => {
    document.body.innerHTML = `<div class="form-item-group langAbility-item"><select name="lngLanguageType"></select></div>`;
    expect(failureGroup(0)).toBeUndefined();
  });

  it("keeps stopping when a nested group owns the select", () => {
    document.body.innerHTML = `<div class="form-item-group langExam-Item"><div class="form-item-group"><select name="lngLanguageType"></select></div></div>`;
    expect(failureGroup(0)).toBeUndefined();
  });

  it("keeps stopping for another profile field", () => {
    document.body.innerHTML = examRow("row-a");
    expect(failureGroup(0, "languages.languageTest.testName")).toBeUndefined();
  });

  it("does not isolate the profile priority status drivers", () => {
    document.body.innerHTML = `<div class="form-item-group"><input type="radio" name="prsVeteranBenefitYN" /></div>`;
    const radio = document.querySelector<HTMLInputElement>("input")!;
    expect(
      adapter.stateDriverFailureGroup?.(
        item("field-veteran", "veteran.veteran.veteranStatus"),
        {
          candidateId: "field-veteran",
          elements: [radio],
          candidate: {
            candidateId: "field-veteran",
            domName: "prsVeteranBenefitYN",
          },
        } as never,
      ),
    ).toBeUndefined();
  });
});
