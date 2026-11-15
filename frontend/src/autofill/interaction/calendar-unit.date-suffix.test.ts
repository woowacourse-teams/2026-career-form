import { afterEach, describe, expect, it } from "vitest";
import { calendarUnitEvidence } from "./calendar-unit";

afterEach(() => document.body.replaceChildren());

function dateInput(label: string) {
  document.body.innerHTML = `<label for="d">${label}</label>
    <input id="d" type="text" readonly>`;
  return document.querySelector<HTMLInputElement>("#d")!;
}

describe("calendar unit evidence from a '~일자' label", () => {
  it.each(["입대일자", "전역(예정)일자", "전역예정일자", "복무 시작일자"])(
    "reads %s as a day calendar label like '입대일'",
    (label) => {
      const plain = calendarUnitEvidence(dateInput("입대일"));
      expect(plain).toMatchObject({ unit: "day" });
      expect(calendarUnitEvidence(dateInput(label))).toEqual(plain);
    },
  );

  it("confirms the day unit from a '~일자' label on a 10-character date field", () => {
    const input = dateInput("입대일자");
    input.setAttribute("maxlength", "10");
    expect(calendarUnitEvidence(input)).toEqual({
      unit: "day",
      unitEvidence: "target-label",
    });
  });

  it("still reads a plain '~일' label as a day calendar label", () => {
    expect(calendarUnitEvidence(dateInput("입대일"))).toMatchObject({
      unit: "day",
    });
  });

  it("does not read a word that only starts with 일자 as a date unit", () => {
    expect(calendarUnitEvidence(dateInput("희망 일자리"))).toBeUndefined();
  });
});
