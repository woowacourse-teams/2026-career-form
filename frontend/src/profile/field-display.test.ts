import { describe, expect, it } from "vitest";

import type { ProfileFieldDefinition } from "./field-definitions";
import { fieldDisplayValue, optionLabel } from "./field-display";

const REGION_OPTIONS = [
  { value: "region:seoul", label: "서울" },
  { value: "region:busan", label: "부산" },
] as const;

describe("field display", () => {
  it("returns option label only for structured options", () => {
    expect(optionLabel(REGION_OPTIONS, "region:seoul")).toBe("서울");
    expect(optionLabel(["주간", "야간"], "주간")).toBeUndefined();
    expect(optionLabel(REGION_OPTIONS, "서울")).toBeUndefined();
    expect(optionLabel(undefined, "region:seoul")).toBeUndefined();
  });

  it("uses optionsFor before static options", () => {
    const field: ProfileFieldDefinition = {
      id: "grade",
      label: "등급",
      inputType: "select",
      options: [{ value: "grade:static", label: "정적" }],
      optionsFor: (values) =>
        values.testName === "opic"
          ? [{ value: "grade:static", label: "동적" }]
          : [],
    };
    const region: ProfileFieldDefinition = {
      id: "schoolRegion",
      label: "학교 소재지",
      inputType: "select",
      options: REGION_OPTIONS,
    };
    const name: ProfileFieldDefinition = {
      id: "schoolName",
      label: "학교명",
      inputType: "text",
    };

    expect(fieldDisplayValue(field, "grade:static", { testName: "opic" })).toBe(
      "동적",
    );
    expect(fieldDisplayValue(field, "grade:static", {})).toBe("grade:static");
    expect(fieldDisplayValue(region, "region:busan", {})).toBe("부산");
    expect(fieldDisplayValue(region, "서울", {})).toBe("서울");
    expect(fieldDisplayValue(name, "region:busan", {})).toBe("region:busan");
  });
});
