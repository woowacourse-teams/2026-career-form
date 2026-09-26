import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  PROFILE_CATEGORIES,
  type ProfileInputType,
} from "../../profile/field-definitions";

const fieldTypes = new Map<string, ProfileInputType>(
  PROFILE_CATEGORIES.flatMap((category) =>
    category.sections.flatMap((section) =>
      section.fields.map(
        (field) =>
          [
            `${category.id}.${section.id}.${field.id}`,
            field.inputType,
          ] as const,
      ),
    ),
  ),
);

function dateDigits(value: string, monthOnly: boolean): string | undefined {
  const match = monthOnly
    ? value.match(/^(\d{4})-?(\d{2})$/)
    : value.match(/^(\d{4})(-?)(\d{2})\2(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[monthOnly ? 2 : 3]);
  if (year < 1 || month < 1 || month > 12) return undefined;
  if (!monthOnly) {
    const day = Number(match[4]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > days[month - 1]) return undefined;
  }
  return value.replaceAll("-", "");
}

function telephoneDigits(value: string): string | undefined {
  if (!/^(?:0\d{8,10}|0\d{1,2}([ -])\d{3,4}\1\d{4})$/.test(value))
    return undefined;
  return value.replace(/[ -]/g, "");
}

function greetingDatePrecision(
  item: ReviewPlanItem,
  key: string | undefined,
  handle?: FieldCandidateHandle,
): "month" | "day" | undefined {
  const trigger = handle?.customElements?.[0];
  const name = handle?.candidate.domName;
  if (
    !trigger?.isConnected ||
    !name ||
    handle?.candidateId !== item.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
    handle.isCurrentContext?.() === false ||
    trigger.getAttribute("name") !== name ||
    !trigger.matches(
      'button[data-scope="date-picker"][data-part="trigger"][aria-controls]',
    )
  )
    return undefined;
  if (
    name === "basicInformation.birthdate" &&
    key === "personal.personal.birthDate"
  )
    return "day";
  const education =
    /^educationalBackground\.(universities|graduateSchools)\.(0|[1-9]\d*)\.enrollmentPeriod\.(startDate|endDate)$/.exec(
      name,
    );
  if (
    education &&
    key ===
      `education.${education[1] === "universities" ? "university" : "graduateSchool"}.${education[3]}`
  )
    return "month";
  const military =
    /^militaryServicePreferentialEmploymentStatus\.militaryService\.servicePeriod\.(startDate|endDate)$/.exec(
      name,
    );
  if (
    military &&
    key ===
      `military.military.${military[1] === "startDate" ? "serviceStartDate" : "serviceEndDate"}`
  )
    return "month";
  return undefined;
}

function greetingExactDisplayFormat(
  item: ReviewPlanItem,
  current: string,
  expected: string,
  handle?: FieldCandidateHandle,
): boolean | undefined {
  const name = handle?.candidate.domName;
  const element = handle && (handle.elements[0] ?? handle.customElements?.[0]);
  const binding = item.analysis?.valueBinding;
  if (
    !name ||
    !element?.isConnected ||
    handle?.candidateId !== item.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    binding?.type !== "DIRECT" ||
    handle.isCurrentContext?.() === false ||
    element.getAttribute("name") !== name
  )
    return undefined;
  if (
    /^educationalBackground\.(?:universities|graduateSchools)\.(?:0|[1-9]\d*)\.gpa\.scoreScale$/.test(
      name,
    ) &&
    binding.profileFieldKey ===
      `education.${name.includes(".universities.") ? "university" : "graduateSchool"}.gpaScale` &&
    element instanceof HTMLButtonElement &&
    handle.candidate.control === "button" &&
    /^\d+(?:\.\d{1,2})?$/.test(current) &&
    /^\d+(?:\.\d{1,2})?$/.test(expected)
  )
    return Number(current) === Number(expected);
  if (
    name ===
      "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber" &&
    binding.profileFieldKey === "veteran.veteran.veteranNumber" &&
    element instanceof HTMLInputElement &&
    handle.candidate.control === "text" &&
    /^\d{2}-?\d{6}$/.test(current) &&
    /^\d{2}-?\d{6}$/.test(expected)
  )
    return current.replace("-", "") === expected.replace("-", "");
  return undefined;
}

export function matchesResultValue(
  item: ReviewPlanItem,
  current: string,
  expected: string,
  handle?: FieldCandidateHandle,
): boolean {
  const left = current.trim();
  const right = expected.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const greetingDisplayMatch = greetingExactDisplayFormat(
    item,
    left,
    right,
    handle,
  );
  if (greetingDisplayMatch !== undefined) return greetingDisplayMatch;
  const binding = item.analysis?.valueBinding;
  if (binding?.type === "LOOKUP" || binding?.type === "BUTTON_OPTION")
    return false;
  if (binding?.type === "DERIVED" && binding.recipe !== "YEAR_MONTH")
    return false;
  const key = binding?.profileFieldKey ?? item.profileFieldKey;
  const kind = key ? fieldTypes.get(key) : undefined;
  const precision = greetingDatePrecision(item, key, handle);
  if (precision) {
    const monthOnly = precision === "month";
    const dotted = monthOnly ? /^\d{4}\. ?\d{2}$/ : /^\d{4}\. ?\d{2}\. ?\d{2}$/;
    const rendered = dotted.test(left) ? left.replace(/\. ?/g, "-") : left;
    const actual = dateDigits(rendered, monthOnly);
    const fullExpected = dateDigits(right, false);
    const expectedDate = monthOnly
      ? (dateDigits(right, true) ?? fullExpected?.slice(0, 6))
      : fullExpected;
    return actual !== undefined && actual === expectedDate;
  }
  const normalize =
    kind === "date"
      ? (value: string) => dateDigits(value, binding?.type === "DERIVED")
      : kind === "tel" && binding?.type !== "DERIVED"
        ? telephoneDigits
        : undefined;
  if (!normalize) return false;
  const normalized = normalize(left);
  return normalized !== undefined && normalized === normalize(right);
}
