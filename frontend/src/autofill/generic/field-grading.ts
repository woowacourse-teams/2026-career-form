import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { FieldCandidate, SemanticContext } from "../api/types";

/** Lower bound (inclusive) of confidence for AUTO. */
export const AUTO_CONFIDENCE_MIN = 0.8;
/** Lower bound (inclusive) of confidence for REVIEW; below it is BLOCKED. */
export const REVIEW_CONFIDENCE_MIN = 0.5;

export type FieldGrade = "AUTO" | "REVIEW" | "BLOCKED";

export type GradeReason =
  | "NO_PROFILE_VALUE"
  | "COUNTRY_CODE_OPTIONS"
  | "NON_DATE_FIELD"
  | "MIXED_EDUCATION_RECORD"
  | "LOW_CONFIDENCE"
  | "MODERATE_CONFIDENCE"
  | "CATEGORY_UNCONFIRMED"
  | "DUPLICATE_KEY_IN_ROW";

export interface GradeSibling {
  profileFieldKey: string;
  confidence: number;
}

export interface GradeFieldInput {
  /** Profile field key such as "personal.personal.nationality". */
  profileFieldKey: string;
  confidence: number;
  categoryConfirmed: boolean;
  /** Whether a profile value exists. Evaluated locally; the value is never passed. */
  hasProfileValue: boolean;
  control: FieldCandidate["control"];
  inputType?: SemanticContext["inputType"];
  options?: readonly { displayName: string }[];
  /** Other matched fields in the same repeat row, excluding this field. */
  rowSiblings?: readonly GradeSibling[];
}

export interface FieldGradeResult {
  grade: FieldGrade;
  reason?: GradeReason;
}

const COUNTRY_KEYS = new Set(["nationality", "residenceCountry"]);
const COUNTRY_CODE_OPTION = /^\+\d{1,3}/;
const EDUCATION_RECORDS = new Set(["highSchool", "university", "graduateSchool"]);

function fieldIdOf(key: string): string {
  return key.split(".")[2] ?? "";
}

function isDateProfileFieldKey(value: string): boolean {
  const [categoryId, sectionId, fieldId] = value.split(".");
  return PROFILE_CATEGORIES.some(
    (category) =>
      category.id === categoryId &&
      category.sections.some(
        (section) =>
          section.id === sectionId &&
          section.fields.some(
            (field) => field.id === fieldId && field.inputType === "date",
          ),
      ),
  );
}

function educationRecordOf(key: string): string | undefined {
  const [categoryId, sectionId] = key.split(".");
  return categoryId === "education" && EDUCATION_RECORDS.has(sectionId ?? "")
    ? sectionId
    : undefined;
}

function hasCountryCodeOptions(input: GradeFieldInput): boolean {
  const options = input.options ?? [];
  if (!COUNTRY_KEYS.has(fieldIdOf(input.profileFieldKey))) return false;
  const codes = options.filter((option) =>
    COUNTRY_CODE_OPTION.test(option.displayName.trim()),
  ).length;
  return options.length > 0 && codes * 2 > options.length;
}

function isNonDateField(input: GradeFieldInput): boolean {
  if (!isDateProfileFieldKey(input.profileFieldKey)) return false;
  if (input.control !== "text" && input.control !== "textarea") return true;
  return (
    input.inputType !== undefined &&
    input.inputType !== "text" &&
    input.inputType !== "date"
  );
}

function hasMixedEducationRecords(input: GradeFieldInput): boolean {
  const own = educationRecordOf(input.profileFieldKey);
  if (!own) return false;
  return (input.rowSiblings ?? []).some((sibling) => {
    const other = educationRecordOf(sibling.profileFieldKey);
    return other !== undefined && other !== own;
  });
}

function isLowerDuplicate(input: GradeFieldInput): boolean {
  return (input.rowSiblings ?? []).some(
    (sibling) =>
      sibling.profileFieldKey === input.profileFieldKey &&
      sibling.confidence >= input.confidence,
  );
}

/**
 * Grades one generic-document match with pure code checks. Reads only its
 * input: no DOM, network, or global state.
 */
export function gradeGenericField(input: GradeFieldInput): FieldGradeResult {
  if (!input.hasProfileValue) {
    return { grade: "BLOCKED", reason: "NO_PROFILE_VALUE" };
  }
  if (hasCountryCodeOptions(input)) {
    return { grade: "BLOCKED", reason: "COUNTRY_CODE_OPTIONS" };
  }
  if (isNonDateField(input)) {
    return { grade: "BLOCKED", reason: "NON_DATE_FIELD" };
  }
  if (hasMixedEducationRecords(input)) {
    return { grade: "BLOCKED", reason: "MIXED_EDUCATION_RECORD" };
  }
  if (!input.categoryConfirmed) {
    return { grade: "REVIEW", reason: "CATEGORY_UNCONFIRMED" };
  }
  if (input.confidence >= AUTO_CONFIDENCE_MIN) {
    if (isLowerDuplicate(input)) {
      return { grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" };
    }
    return { grade: "AUTO" };
  }
  if (input.confidence >= REVIEW_CONFIDENCE_MIN) {
    return { grade: "REVIEW", reason: "MODERATE_CONFIDENCE" };
  }
  return { grade: "BLOCKED", reason: "LOW_CONFIDENCE" };
}
