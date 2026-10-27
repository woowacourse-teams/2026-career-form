import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { matchDatePartOption, type DatePart } from "./date-part-options";
import { resolveChoiceOption, type ChoiceContext } from "../profile/choice-option";
import type {
  DerivedRecipe,
  FieldCandidate,
  SemanticContext,
} from "../api/types";

/** Lower bound (inclusive) of confidence for AUTO. */
export const AUTO_CONFIDENCE_MIN = 0.8;
/** Lower bound (inclusive) of confidence for REVIEW; below it is BLOCKED. */
export const REVIEW_CONFIDENCE_MIN = 0.5;
/**
 * Lower bound (inclusive) of confidence at which an exact, non-derived profile
 * key with a consistent section and row is promoted to AUTO.
 */
export const PROMOTE_CONFIDENCE_MIN = 0.35;

export type FieldGrade = "AUTO" | "REVIEW" | "BLOCKED";

export type GradeReason =
  | "NO_PROFILE_VALUE"
  | "PAIRED_DATE_INFERRED"
  | "LANGUAGE_RESULT_INFERRED"
  | "COUNTRY_CODE_OPTIONS"
  | "NON_DATE_FIELD"
  | "MIXED_EDUCATION_RECORD"
  | "MIXED_RECORD_KIND"
  | "SCALE_KEY_MISMATCH"
  | "LOW_CONFIDENCE"
  | "MODERATE_CONFIDENCE"
  | "CATEGORY_UNCONFIRMED"
  | "DUPLICATE_KEY_IN_ROW"
  | "DATE_PART_OPTIONS_MISMATCH"
  | "NO_FIELD_CONTEXT"
  | "FORMAT_KEY_MISMATCH"
  | "OTHER_PERSON_CONTEXT"
  | "UNPAIRED_NAME_PART"
  | "OPTION_VALUE_UNMATCHED"
  | "GRADE_OTHER_OPTION"
  | "FIRST_ENTRY_SINGLE_ROW";

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
  /**
   * Present for a field whose written value must be one of its options.
   * Evaluated locally and never sent; the value is read only to compare it.
   */
  optionValueCheck?: { profileValue?: string; context?: ChoiceContext };
  /** Other matched fields in the same repeat row, excluding this field. */
  rowSiblings?: readonly GradeSibling[];
  /** Keys of the nearest matched fields before and after this one in its row. */
  rowNeighborKeys?: readonly (string | undefined)[];
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
const EDUCATION_RECORDS = new Set([
  "highSchool",
  "university",
  "graduateSchool",
]);
const POSTAL_TEXT =
  /우편\s*번호|\bpostal(?:[\s_-]*code)?\b|\bzip(?:[\s_-]*code)?\b/i;

/**
 * The page option a stored value maps to, or undefined unless exactly one
 * option matches under the generic rules of option-match.ts. Evidence is the
 * value itself or the label the profile field's fixed option set gives it.
 */
export function matchProfileValueOption(
  profileFieldKey: string | undefined,
  profileValue: string | undefined,
  options: readonly { displayName: string }[] | undefined,
  context?: ChoiceContext,
): string | undefined {
  const result = resolveChoiceOption(profileFieldKey, profileValue, options, context);
  return result.status === "unique" ? result.option.displayName : undefined;
}

/** Whether a profile value exists but no page option matches it. */
function hasUnmatchedOptionValue(input: GradeFieldInput): boolean {
  if (!input.optionValueCheck) return false;
  if (input.control !== "select" && input.control !== "radio") return false;
  if (input.composite) return false;
  return (
    matchProfileValueOption(
      input.profileFieldKey,
      input.optionValueCheck.profileValue,
      input.options,
      input.optionValueCheck.context,
    ) === undefined
  );
}

/** Role words for a person other than the applicant (referee, guarantor, guardian, emergency contact). */
const OTHER_PERSON_ROLE =
  /추천\s*인|추천\s*자|보증\s*인|보호\s*자|법정\s*대리인|비상\s*연락|긴급\s*연락|\b(?:referee|referrer|referral|guarantor|guardian|next[\s_-]+of[\s_-]+kin|emergency[\s_-]+contact)\b/i;
/** Applicant's own contact and identity keys that must never fill another person's field. */
const APPLICANT_OWN_FIELD_IDS: Readonly<Record<string, ReadonlySet<string>>> = {
  "personal.personal": new Set([
    "koreanFamilyName",
    "koreanGivenName",
    "hanjaFamilyName",
    "hanjaGivenName",
    "englishFamilyName",
    "englishGivenName",
  ]),
  "contact.contact": new Set([
    "email",
    "secondaryEmail",
    "phoneNumber",
    "residenceCountry",
    "postalCode",
    "addressLine1",
    "addressLine2",
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

/** Repeated record kinds a single row describes one of. */
const REPEATED_RECORD_KINDS = new Set([
  "careers",
  "projects",
  "certifications",
  "languages",
]);

function repeatedRecordKind(key: string | undefined): string | undefined {
  const kind = key?.split(".")[0];
  return kind && REPEATED_RECORD_KINDS.has(kind) ? kind : undefined;
}

/**
 * A row whose other keys all name one other repeated record kind describes
 * that record; a key of a different kind inside it was mismapped.
 */
function hasMixedRecordKind(input: GradeFieldInput): boolean {
  const own = repeatedRecordKind(input.profileFieldKey);
  if (!own) return false;
  const kinds = (input.rowSiblings ?? [])
    .map((sibling) => repeatedRecordKind(sibling.profileFieldKey))
    .filter((kind): kind is string => kind !== undefined);
  if (kinds.length >= 2 && !kinds.includes(own) && new Set(kinds).size === 1)
    return true;
  // Inside a row that mixes record kinds, a key whose nearest fields on both
  // sides are one other kind sits in that record's run of fields.
  const neighbors = (input.rowNeighborKeys ?? []).map(repeatedRecordKind);
  return (
    neighbors.length === 2 &&
    neighbors[0] !== undefined &&
    neighbors[0] === neighbors[1] &&
    neighbors[0] !== own
  );
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
    const [categoryId, sectionId, fieldId] = (
      input.profileFieldKey ?? ""
    ).split(".");
    if (
      !APPLICANT_OWN_FIELD_IDS[`${categoryId}.${sectionId}`]?.has(fieldId ?? "")
    ) {
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

const SCALE_TEXT = /총점|만점|기준\s*점수|\bscale\b|out\s+of|\bmax(?:imum)?\b/i;
const CREDIT_TEXT = /학점|이수|credit/i;

/** A score scale field ("총점", "만점") is not a credit count. */
function hasScaleKeyMismatch(input: GradeFieldInput): boolean {
  if (fieldIdOf(input.profileFieldKey ?? "") !== "totalCredits") return false;
  const texts = [
    input.displayName,
    input.title,
    input.placeholder,
    ...(input.labels ?? []).map((label) => label.text),
  ];
  return (
    texts.some((text) => SCALE_TEXT.test(text ?? "")) &&
    !texts.some((text) => CREDIT_TEXT.test(text ?? ""))
  );
}

function hasFormatKeyMismatch(input: GradeFieldInput): boolean {
  if (input.inputType === "email" || input.inputType === "tel") {
    return !isProfileFieldType(input.profileFieldKey, input.inputType);
  }
  const postalFormat =
    input.autocomplete === "postal-code" ||
    (input.maxLength !== undefined &&
      input.maxLength > 0 &&
      input.maxLength <= 6 &&
      input.inputMode === "numeric") ||
    [input.title, input.placeholder].some((text) =>
      POSTAL_TEXT.test(text ?? ""),
    );
  return (
    postalFormat &&
    input.profileFieldKey?.startsWith("contact.contact.") === true &&
    ["addressLine1", "addressLine2", "residenceCountry"].includes(
      fieldIdOf(input.profileFieldKey),
    )
  );
}

/**
 * A match below the AUTO boundary that is still as safe as an exact one: its
 * own profile key (no derived recipe or date part), no half name, no lower
 * duplicate in the row, and some field context. Category confirmation and the
 * section and row checks have already passed by the time this runs.
 */
function isPromotableExactMatch(input: GradeFieldInput): boolean {
  return (
    input.confidence >= PROMOTE_CONFIDENCE_MIN &&
    input.composite === undefined &&
    Boolean(input.profileFieldKey) &&
    !hasUnpairedNamePart(input) &&
    !isLowerDuplicate(input) &&
    Boolean(
      input.displayName?.trim() ||
        input.labels?.some((label) => label.text.trim()),
    )
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
  if (hasMixedRecordKind(input)) {
    return { grade: "BLOCKED", reason: "MIXED_RECORD_KIND" };
  }
  if (hasOtherPersonContext(input)) {
    return { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };
  }
  if (hasScaleKeyMismatch(input)) {
    return { grade: "BLOCKED", reason: "SCALE_KEY_MISMATCH" };
  }
  if (hasFormatKeyMismatch(input)) {
    return { grade: "BLOCKED", reason: "FORMAT_KEY_MISMATCH" };
  }
  if (hasUnmatchedOptionValue(input)) {
    // A stored value that names no page option needs the applicant's choice.
    // Without a value or any option there is nothing to choose, and a link
    // below the promote boundary is too weak to offer, so those stay blocked.
    const canChoose =
      input.optionValueCheck?.profileValue?.trim() &&
      (input.options?.length ?? 0) > 0 &&
      input.confidence >= PROMOTE_CONFIDENCE_MIN;
    return canChoose
      ? { grade: "REVIEW", reason: "OPTION_VALUE_UNMATCHED" }
      : { grade: "BLOCKED", reason: "OPTION_VALUE_UNMATCHED" };
  }
  if (input.optionValueCheck && (input.control === "select" || input.control === "radio") && !input.composite) {
    const choice = resolveChoiceOption(
      input.profileFieldKey, input.optionValueCheck.profileValue,
      input.options, input.optionValueCheck.context,
    );
    if (choice.status === "unique" && choice.reason === "GRADE_OTHER_OPTION")
      return { grade: input.confidence >= PROMOTE_CONFIDENCE_MIN ? "REVIEW" : "BLOCKED", reason: choice.reason };
  }
  if (input.confidence >= AUTO_CONFIDENCE_MIN && hasUnpairedNamePart(input)) {
    return { grade: "REVIEW", reason: "UNPAIRED_NAME_PART" };
  }
  if (!input.categoryConfirmed) {
    return { grade: "REVIEW", reason: "CATEGORY_UNCONFIRMED" };
  }
  if (input.confidence >= AUTO_CONFIDENCE_MIN) {
    if (isLowerDuplicate(input)) {
      return { grade: "REVIEW", reason: "DUPLICATE_KEY_IN_ROW" };
    }
    if (
      !input.displayName?.trim() &&
      !input.labels?.some((label) => label.text.trim())
    ) {
      return { grade: "REVIEW", reason: "NO_FIELD_CONTEXT" };
    }
    return { grade: "AUTO" };
  }
  if (isPromotableExactMatch(input)) return { grade: "AUTO" };
  if (input.confidence >= REVIEW_CONFIDENCE_MIN) {
    return { grade: "REVIEW", reason: "MODERATE_CONFIDENCE" };
  }
  return { grade: "BLOCKED", reason: "LOW_CONFIDENCE" };
}
