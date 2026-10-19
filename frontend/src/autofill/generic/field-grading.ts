import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { matchDatePartOption, type DatePart } from "./date-part-options";
import type {
  DerivedRecipe,
  FieldCandidate,
  SemanticContext,
} from "../api/types";

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
  | "DUPLICATE_KEY_IN_ROW"
  | "DATE_PART_OPTIONS_MISMATCH"
  | "NO_FIELD_CONTEXT"
  | "FORMAT_KEY_MISMATCH"
  | "OTHER_PERSON_CONTEXT"
  | "UNPAIRED_NAME_PART";

/** A match whose value is composed: a name recipe or one part of a date. */
export type GradeComposite =
  | { type: "DERIVED"; recipe: DerivedRecipe }
  | {
      type: "DATE_PART";
      part: DatePart;
      /** The local date. Evaluated locally and never sent. */
      localDate?: string;
    };

export interface GradeSibling {
  profileFieldKey?: string;
  composite?: GradeComposite;
  confidence: number;
}

export interface GradeFieldInput extends Pick<
  SemanticContext,
  "inputType" | "inputMode" | "autocomplete" | "maxLength" | "labels"
> {
  /** Profile field key such as "personal.personal.nationality". */
  profileFieldKey?: string;
  /** Present when the field is bound to a derived value instead of one key. */
  composite?: GradeComposite;
  confidence: number;
  categoryConfirmed: boolean;
  /** Whether a profile value exists. Evaluated locally; the value is never passed. */
  hasProfileValue: boolean;
  control: FieldCandidate["control"];
  displayName?: string;
  /** Own DOM attributes, supplied locally by generic analysis, not sent to APIs. */
  title?: string;
  placeholder?: string;
  options?: readonly { displayName: string }[];
  /** Other matched fields in the same repeat row, excluding this field. */
  rowSiblings?: readonly GradeSibling[];
  /**
   * Profile keys matched on the other fields of the same section (the same
   * row for a repeat section), whatever their kind.
   */
  sectionSiblingKeys?: readonly string[];
}

export interface FieldGradeResult {
  grade: FieldGrade;
  reason?: GradeReason;
}

const COUNTRY_KEYS = new Set(["nationality", "residenceCountry"]);
const COUNTRY_CODE_OPTION = /^\+\d{1,3}/;
const EDUCATION_RECORDS = new Set(["highSchool", "university", "graduateSchool"]);
const POSTAL_TEXT = /우편\s*번호|\bpostal(?:[\s_-]*code)?\b|\bzip(?:[\s_-]*code)?\b/i;

/** Role words for a person other than the applicant (referee, guarantor, guardian, emergency contact). */
const OTHER_PERSON_ROLE =
  /추천\s*인|추천\s*자|보증\s*인|보호\s*자|법정\s*대리인|비상\s*연락|긴급\s*연락|\b(?:referee|referrer|referral|guarantor|guardian|next[\s_-]+of[\s_-]+kin|emergency[\s_-]+contact)\b/i;
/** Applicant's own contact and identity keys that must never fill another person's field. */
const APPLICANT_OWN_FIELD_IDS: Readonly<Record<string, ReadonlySet<string>>> = {
  "personal.personal": new Set([
    "koreanFamilyName", "koreanGivenName", "hanjaFamilyName", "hanjaGivenName",
    "englishFamilyName", "englishGivenName",
  ]),
  "contact.contact": new Set([
    "email", "secondaryEmail", "phoneNumber", "residenceCountry", "postalCode",
    "addressLine1", "addressLine2",
  ]),
};

function fieldIdOf(key: string | undefined): string {
  return key?.split(".")[2] ?? "";
}

function isProfileFieldType(
  value: string | undefined,
  type: "date" | "email" | "tel",
): boolean {
  if (!value) return false;
  const [categoryId, sectionId, fieldId] = value.split(".");
  return PROFILE_CATEGORIES.some(
    (category) =>
      category.id === categoryId &&
      category.sections.some(
        (section) =>
          section.id === sectionId &&
          section.fields.some(
            (field) => field.id === fieldId && field.inputType === type,
          ),
      ),
  );
}

function educationRecordOf(key: string | undefined): string | undefined {
  if (!key) return undefined;
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
  if (!isProfileFieldType(input.profileFieldKey, "date")) return false;
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

function compositeSlot(composite: GradeComposite | undefined): string {
  if (!composite) return "";
  return composite.type === "DERIVED"
    ? `DERIVED:${composite.recipe}`
    : `DATE_PART:${composite.part}`;
}

function hasDatePartOption(input: GradeFieldInput): boolean {
  const { composite } = input;
  return (
    composite?.type === "DATE_PART" &&
    input.control === "select" &&
    composite.localDate !== undefined &&
    matchDatePartOption(
      composite.part,
      composite.localDate,
      input.options ?? [],
    ) !== undefined
  );
}

function isLowerDuplicate(input: GradeFieldInput): boolean {
  return (input.rowSiblings ?? []).some(
    (sibling) =>
      sibling.profileFieldKey === input.profileFieldKey &&
      compositeSlot(sibling.composite) === compositeSlot(input.composite) &&
      sibling.confidence >= input.confidence,
  );
}

function hasOtherPersonContext(input: GradeFieldInput): boolean {
  // Every derived recipe composes the applicant's own name, so it is never
  // right for another person's field.
  if (input.composite?.type !== "DERIVED") {
    const [categoryId, sectionId, fieldId] = (input.profileFieldKey ?? "").split(".");
    if (!APPLICANT_OWN_FIELD_IDS[`${categoryId}.${sectionId}`]?.has(fieldId ?? "")) {
      return false;
    }
  }
  return [
    input.displayName,
    input.title,
    input.placeholder,
    ...(input.labels ?? []).map((label) => label.text),
  ].some((text) => OTHER_PERSON_ROLE.test(text ?? ""));
}

const ENGLISH_NAME_PAIR: Readonly<Record<string, string>> = {
  "personal.personal.englishGivenName": "personal.personal.englishFamilyName",
  "personal.personal.englishFamilyName": "personal.personal.englishGivenName",
};

/** A single English name part matched without its counterpart nearby would fill only half a name. */
function hasUnpairedNamePart(input: GradeFieldInput): boolean {
  const pair = ENGLISH_NAME_PAIR[input.profileFieldKey ?? ""];
  return (
    input.composite === undefined &&
    pair !== undefined &&
    !(input.sectionSiblingKeys ?? []).includes(pair)
  );
}

function hasFormatKeyMismatch(input: GradeFieldInput): boolean {
  if (input.inputType === "email" || input.inputType === "tel") {
    return !isProfileFieldType(input.profileFieldKey, input.inputType);
  }
  const postalFormat = input.autocomplete === "postal-code" ||
    (input.maxLength !== undefined && input.maxLength > 0 &&
      input.maxLength <= 6 && input.inputMode === "numeric") ||
    [input.title, input.placeholder].some((text) => POSTAL_TEXT.test(text ?? ""));
  return postalFormat &&
    input.profileFieldKey?.startsWith("contact.contact.") === true &&
    ["addressLine1", "addressLine2", "residenceCountry"].includes(fieldIdOf(input.profileFieldKey));
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
  if (input.composite?.type === "DATE_PART") {
    if (!hasDatePartOption(input)) {
      return { grade: "BLOCKED", reason: "DATE_PART_OPTIONS_MISMATCH" };
    }
  } else if (isNonDateField(input)) {
    return { grade: "BLOCKED", reason: "NON_DATE_FIELD" };
  }
  if (hasMixedEducationRecords(input)) {
    return { grade: "BLOCKED", reason: "MIXED_EDUCATION_RECORD" };
  }
  if (hasOtherPersonContext(input)) {
    return { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };
  }
  if (hasFormatKeyMismatch(input)) {
    return { grade: "BLOCKED", reason: "FORMAT_KEY_MISMATCH" };
  }
  if (!input.categoryConfirmed) {
    return { grade: "REVIEW", reason: "CATEGORY_UNCONFIRMED" };
  }
  if (input.confidence >= AUTO_CONFIDENCE_MIN) {
    if (isLowerDuplicate(input)) {
      return { grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" };
    }
    if (!input.displayName?.trim() &&
      !input.labels?.some((label) => label.text.trim())) {
      return { grade: "REVIEW", reason: "NO_FIELD_CONTEXT" };
    }
    if (hasUnpairedNamePart(input)) {
      return { grade: "REVIEW", reason: "UNPAIRED_NAME_PART" };
    }
    return { grade: "AUTO" };
  }
  if (input.confidence >= REVIEW_CONFIDENCE_MIN) {
    return { grade: "REVIEW", reason: "MODERATE_CONFIDENCE" };
  }
  return { grade: "BLOCKED", reason: "LOW_CONFIDENCE" };
}
