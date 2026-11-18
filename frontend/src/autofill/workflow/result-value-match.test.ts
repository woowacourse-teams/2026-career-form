import { describe, expect, it } from "vitest";
import type { ValueBinding } from "../api/types";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { matchesResultValue } from "./result-value-match";

function item(key?: string, binding?: ValueBinding): ReviewPlanItem {
  return {
    candidateId: "fixture-field",
    fieldLabel: "확인 항목",
    profileFieldKey: key,
    currentValue: "",
    previewValue: "",
    status: "needs-review",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
    ...(binding
      ? {
          analysis: {
            candidateId: "fixture-field",
            matchType: "MATCH" as const,
            valueBinding: binding,
            autofillPolicy: "CONDITIONAL" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        }
      : {}),
  };
}

describe("result value equivalence", () => {
  it.each([
    ["  Example User ", "Example User", true],
    ["Example User", "example user", false],
    ["Example  User", "Example User", false],
    ["C++", "C", false],
    ["기관A", "기관A 연구소", false],
    ["20240115", "2024-01-15", false],
    ["01000000000", "010-0000-0000", false],
    ["", "", false],
    [" ", "value", false],
  ])("keeps plain text exact: %s / %s", (current, expected, matches) => {
    expect(matchesResultValue(item(), current, expected)).toBe(matches);
  });

  it.each([
    ["20240115", "2024-01-15", true],
    ["2024-02-29", "20240229", true],
    ["20230115", "2024-01-15", false],
    ["20230229", "2023-02-29", false],
    ["20241301", "2024-13-01", false],
    ["20240431", "2024-04-31", false],
    ["2024-01", "2024-01-15", false],
    ["2024/01/15", "2024-01-15", false],
    ["2024-01-15T00:00:00", "2024-01-15", false],
  ])("compares full date precision: %s / %s", (current, expected, matches) => {
    expect(
      matchesResultValue(
        item("personal.personal.birthDate"),
        current,
        expected,
      ),
    ).toBe(matches);
  });

  it("uses the mapped date key when the review item has no direct field key", () => {
    expect(
      matchesResultValue(
        item(undefined, {
          type: "DIRECT",
          profileFieldKey: "languages.languageTest.acquisitionDate",
        }),
        "20240115",
        "2024-01-15",
      ),
    ).toBe(true);
  });

  it.each([
    ["202403", "2024-03", true],
    ["2024-03", "202403", true],
    ["202400", "2024-00", false],
    ["202413", "2024-13", false],
    ["2024-03", "2024-03-15", false],
    ["20240315", "2024-03-15", false],
  ])(
    "honors derived month precision: %s / %s",
    (current, expected, matches) => {
      expect(
        matchesResultValue(
          item(undefined, {
            type: "DERIVED",
            recipe: "YEAR_MONTH",
            profileFieldKey: "education.university.startDate",
          }),
          current,
          expected,
        ),
      ).toBe(matches);
    },
  );

  it.each([
    ["01000000000", "010-0000-0000", true],
    ["010 0000 0000", "010-0000-0000", true],
    ["020000000", "02-000-0000", true],
    ["01000000001", "010-0000-0000", false],
    ["+82 10 0000 0000", "010-0000-0000", false],
    ["010-0000-0000 내선 1", "010-0000-0000", false],
    ["010 0000-0000", "010-0000-0000", false],
    ["0-1000000000", "010-0000-0000", false],
  ])(
    "compares telephone digits without guessing: %s / %s",
    (current, expected, matches) => {
      expect(
        matchesResultValue(
          item("contact.contact.phoneNumber"),
          current,
          expected,
        ),
      ).toBe(matches);
    },
  );

  it("does not interpret unknown date-like keys or selected option labels", () => {
    const date = "personal.personal.birthDate";
    for (const target of [
      item("unknown.section.birthDate"),
      item("certifications.certificate.registrationNo"),
      item(date, { type: "LOOKUP", profileFieldKey: date, optionMap: {} }),
      item(date, {
        type: "BUTTON_OPTION",
        profileFieldKey: date,
        optionMap: {},
        optionCodeMap: {},
      }),
      item(date, {
        type: "DIRECT",
        profileFieldKey: "personal.personal.koreanGivenName",
      }),
    ]) {
      expect(matchesResultValue(target, "20240115", "2024-01-15")).toBe(false);
    }
  });
});

describe("result date values the site redisplays", () => {
  it("counts a date shown with separators as the written date", () => {
    const dated = {
      ...item("education.university.startDate"),
      dateApproval: { format: "YYYYMM" },
    } as ReviewPlanItem;
    expect(matchesResultValue(dated, "2020-03", "202003")).toBe(true);
    expect(matchesResultValue(dated, "2020-04", "202003")).toBe(false);
  });

  it("keeps exact comparison for a field that is not a date", () => {
    expect(
      matchesResultValue(item("contact.contact.phoneNumber"), "010-1234", "0101234"),
    ).toBe(false);
  });
});

describe("a lone checkbox named after another stored choice", () => {
  function nightBox(checked: boolean) {
    document.body.innerHTML = `<input type="checkbox" id="night"><label for="night">야간</label>`;
    const box = document.querySelector<HTMLInputElement>("#night")!;
    box.checked = checked;
    return {
      candidateId: "fixture-field",
      elements: [box],
      candidate: { candidateId: "fixture-field", control: "checkbox" },
    } as unknown as FieldCandidateHandle;
  }
  const attendance = {
    ...item("education.university.attendanceType"),
    profileValue: "attendance:day",
  };

  it("matches a day attendance when the night box stays unchecked", () => {
    expect(
      matchesResultValue(attendance, "", "attendance:day", nightBox(false)),
    ).toBe(true);
  });

  it("does not match a day attendance when the night box is checked", () => {
    expect(
      matchesResultValue(attendance, "", "attendance:day", nightBox(true)),
    ).toBe(false);
  });
});
