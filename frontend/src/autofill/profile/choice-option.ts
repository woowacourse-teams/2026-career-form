import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import {
  EMPLOYMENT_STATUS_SYNONYMS,
  MILITARY_STATUS_OPTIONS,
  standardValueAliases,
} from "../../profile/standard-values";
import { matchOptionIndexAny, normalizeOptionText } from "../generic/option-match";
import { matchCompositeMilitaryOption } from "./standard-option-match";
import { normalizeDisplayName } from "../write/display-name";

export interface ChoiceContext {
  militaryStatus?: string;
  militaryType?: string;
  militaryRank?: string;
}

export type ChoiceResolution<T> =
  | { status: "unique"; option: T; reason?: "GRADE_OTHER_OPTION" }
  | { status: "none" }
  | { status: "ambiguous" };

const compact = (value: string) => normalizeOptionText(value).replace(/\s+/g, "");
const TARGET = ["대상", "해당", "예", "있음", "y", "yes", "true"];
const NOT_TARGET = ["비대상", "비해당", "해당없음", "해당사항없음", "아니오", "없음", "n", "no", "false"];
const MALE = ["남", "남자", "남성", "m", "male"];
const FEMALE = ["여", "여자", "여성", "f", "female"];
const NONBINARY = ["논바이너리", "nonbinary", "non-binary", "논바이너리(nonbinary)"];
const DOMESTIC = /^(내국인|국내|국내\(한국국적\)|내국인\(대한민국\))$/;
const FOREIGN = /^(외국인|외국|국외)$/;
/** Stored short employment forms and their common long site labels. */
const EMPLOYMENT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  정규: ["정규직"],
  계약: ["계약직", "기간제", "기간제(계약직)", "계약직(기간제)"],
  파견: ["파견직"],
};

/** A stored degree and the school-type option sites list for it. */
const DEGREE_SCHOOL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  학사: ["대학교", "대학교(4년)", "4년제대학"],
  전문학사: ["전문대학", "대학교(2,3년)", "2,3년제대학"],
  석사: ["대학원(석사)", "석사과정"],
  박사: ["대학원(박사)", "박사과정"],
};

/** Local-only meaning resolution shared by grading, binding and native writes. */
export function resolveChoiceOption<T extends { displayName: string }>(
  key: string | undefined,
  value: string | undefined,
  options: readonly T[] = [],
  context: ChoiceContext = {},
): ChoiceResolution<T> {
  if (!value?.trim()) return { status: "none" };
  const [categoryId, sectionId, fieldId] = (key ?? "").split(".");
  const fixed = PROFILE_CATEGORIES.find((category) => category.id === categoryId)
    ?.sections.find((section) => section.id === sectionId)
    ?.fields.find((field) => field.id === fieldId)?.options ?? [];
  const aliases = new Set([value, ...standardValueAliases(value)].map(normalizeOptionText));
  for (const entry of fixed) {
    const words = typeof entry === "string"
      ? [entry]
      : [entry.value, entry.label, ...standardValueAliases(entry.value)];
    if (words.some((word) => aliases.has(normalizeOptionText(word))))
      words.forEach((word) => aliases.add(normalizeOptionText(word)));
  }
  if (key === "careers.career.employmentType")
    (EMPLOYMENT_ALIASES[value.trim()] ?? []).forEach((word) =>
      aliases.add(normalizeOptionText(word)));
  if (fieldId === "degreeLevel")
    (DEGREE_SCHOOL_ALIASES[value.trim()] ?? []).forEach((word) =>
      aliases.add(normalizeOptionText(word)));
  const pick = (matches: readonly T[], reason?: "GRADE_OTHER_OPTION"): ChoiceResolution<T> =>
    matches.length === 1
      ? { status: "unique", option: matches[0]!, ...(reason ? { reason } : {}) }
      : { status: matches.length ? "ambiguous" : "none" };
  const groups = key === "personal.personal.gender" ? [MALE, FEMALE, NONBINARY]
    : key === "veteran.veteran.veteranStatus" || key === "disability.disability.disabilityStatus"
      ? [TARGET, NOT_TARGET]
      : key === "careers.career.employmentStatus" ? Object.values(EMPLOYMENT_STATUS_SYNONYMS) : [];
  const meanings = groups.filter((group) => group.some((word) => aliases.has(word)));
  if (meanings.length > 1) return { status: "ambiguous" };
  if (meanings.length === 1) {
    const words = new Set([...meanings[0]!, ...aliases].map(compact));
    return pick(options.filter((option) => words.has(compact(option.displayName))));
  }
  if (key === "personal.personal.nationality" &&
      ["한국", "대한민국", "한국국적", "southkorea", "republicofkorea", "kr", "kor"].includes(compact(value))) {
    const domestic = options.filter((option) => DOMESTIC.test(compact(option.displayName)));
    const foreign = options.filter((option) => FOREIGN.test(compact(option.displayName)));
    if (domestic.length || foreign.length)
      return options.length === 2 && domestic.length === 1 && foreign.length === 1
        ? pick(domestic) : { status: "none" };
  }
  // Exact aliases are checked together: duplicate meanings must not prefer one label.
  const exact = options.filter((option) => aliases.has(normalizeOptionText(option.displayName)));
  if (exact.length) return pick(exact);
  const displayAliases = new Set([...aliases].map(normalizeDisplayName));
  const displayMatches = options.filter((option) =>
    displayAliases.has(normalizeDisplayName(normalizeOptionText(option.displayName))));
  if (displayMatches.length) return pick(displayMatches);

  if (key === "military.military.militaryStatus" || key === "military.military.militaryType") {
    const statusValue = key.endsWith("militaryStatus") ? value : context.militaryStatus;
    const status = MILITARY_STATUS_OPTIONS.find((entry) =>
      [entry.value, ...standardValueAliases(entry.value)].some((word) => compact(word) === compact(statusValue ?? "")))?.value;
    const composite = matchCompositeMilitaryOption(
      status ?? (key.endsWith("militaryType") ? "military-status:served" : ""),
      context.militaryRank,
      options.map((option, index) => ({ ...option, optionId: String(index) })),
      key.endsWith("militaryType") ? value : context.militaryType,
    );
    return composite.status === "unique"
      ? pick([options[Number(composite.option.optionId)]!])
      : { status: composite.status === "ambiguous" ? "ambiguous" : "none" };
  }
  const index = matchOptionIndexAny([...aliases], options.map((option) => option.displayName));
  if (index !== null) return pick([options[index]!]);
  if (key === "certifications.certificate.grade" && /^(기술사|기능장|기사|산업기사|기능사)$/.test(value.trim())) {
    // An existing but duplicate grade remains ambiguous, never replaced by other.
    if (options.some((option) => compact(option.displayName) === compact(value)))
      return { status: "ambiguous" };
    return pick(options.filter((option) => compact(option.displayName) === "기타"), "GRADE_OTHER_OPTION");
  }
  const numeric = /^\d+(\.\d+)?$/;
  return numeric.test(value.trim())
    ? pick(options.filter((option) => numeric.test(option.displayName.trim()) && Number(option.displayName) === Number(value)))
    : { status: "none" };
}
