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

export function matchesResultValue(
  item: ReviewPlanItem,
  current: string,
  expected: string,
): boolean {
  const left = current.trim();
  const right = expected.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const binding = item.analysis?.valueBinding;
  if (binding?.type === "LOOKUP" || binding?.type === "BUTTON_OPTION")
    return false;
  if (binding?.type === "DERIVED" && binding.recipe !== "YEAR_MONTH")
    return false;
  const key = binding?.profileFieldKey ?? item.profileFieldKey;
  const kind = key ? fieldTypes.get(key) : undefined;
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
