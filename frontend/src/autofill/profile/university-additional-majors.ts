import type { FieldValues } from "../../profile/model";

/** Compact slots preserve double-major then minor order without placeholder rows. */
export function universityAdditionalMajors(
  values: FieldValues,
): { name: string; classification: "복수전공" | "부전공" }[] | undefined {
  const majors: { name: string; classification: "복수전공" | "부전공" }[] = [];
  for (const [flag, field, classification] of [
    ["doubleMajorStatus", "additionalMajorName", "복수전공"],
    ["minorStatus", "minorName", "부전공"],
  ] as const) {
    const status = values[flag]?.trim() ?? "";
    const name = values[field]?.trim() ?? "";
    if (status === "있음" && name) majors.push({ name, classification });
    else if (!((status === "없음" || status === "") && name === ""))
      return undefined;
  }
  return majors;
}
