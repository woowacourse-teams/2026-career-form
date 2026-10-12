import { formatProfileDate } from "../../autofill/profile/date-format";
import { catalogKindForField } from "../catalog-search";
import {
  PROFILE_CATEGORIES,
  type ProfileFieldDefinition,
} from "../field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileEntry,
  RepeatedProfileCategoryId,
  SingleProfileCategoryId,
} from "../model";
import {
  cloneProfile,
  profilesEqual,
  REPEATED_CATEGORY_IDS,
  type ProfileRepository,
} from "../profile-repository";

export interface ImportEntrySelection {
  categoryId: RepeatedProfileCategoryId;
  sectionId: string;
  sourceRow: number;
  targetId?: string;
  values: FieldValues;
}
export interface ImportSelection {
  personal?: { koreanFamilyName?: string; koreanGivenName?: string };
  contact?: { email?: string; phoneNumber?: string };
  education?: {
    sourceRow: number;
    targetId?: string;
    values: { schoolName?: string; startDate?: string; endDate?: string };
  }[];
  single?: Partial<Record<SingleProfileCategoryId, FieldValues>>;
  entries?: ImportEntrySelection[];
}
export class ImportConflictError extends Error {
  constructor() {
    super("프로필이 변경되었습니다. 다시 불러온 뒤 선택해 주세요.");
    this.name = "ImportConflictError";
  }
}
export class ImportSelectionError extends Error {
  constructor() {
    super(
      "선택한 정보를 확인해 주세요. 중복 항목이나 불완전한 값은 저장할 수 없습니다.",
    );
    this.name = "ImportSelectionError";
  }
}
function record(value: unknown): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new ImportSelectionError();
}
function selectedValues(
  value: unknown,
  allowed: readonly string[],
): FieldValues {
  record(value);
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, text] of entries) {
    if (!allowed.includes(key) || typeof text !== "string" || !text.trim())
      throw new ImportSelectionError();
  }
  return Object.fromEntries(
    entries.map(([key, text]) => [key, (text as string).trim()]),
  );
}
function validateValues(
  values: FieldValues,
  definitions: readonly ProfileFieldDefinition[],
  existing: FieldValues = {},
) {
  const combined = { ...existing, ...values };
  for (const [key, value] of Object.entries(values)) {
    const field = definitions.find((item) => item.id === key);
    if (!field || (field.visibleWhen && !field.visibleWhen(combined)))
      throw new ImportSelectionError();
    if (
      field.inputType === "date" &&
      formatProfileDate(value, "YYYY-MM-DD").status !== "resolved"
    )
      throw new ImportSelectionError();
    if (
      field.inputType === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      throw new ImportSelectionError();
    if (field.inputType === "tel" && !/^0\d{9,10}$/.test(value))
      throw new ImportSelectionError();
    const options = field.optionsFor?.(combined) ?? field.options;
    if (
      options &&
      !options.some(
        (option) =>
          (typeof option === "string" ? option : option.value) === value,
      )
    )
      throw new ImportSelectionError();
  }
}
const ENTRY_KEYS: Record<string, readonly string[]> = {
  highSchool: ["schoolName", "startDate", "endDate", "qualificationPassDate"],
  university: ["schoolName", "startDate", "endDate"],
  graduateSchool: ["schoolName", "startDate", "endDate", "degreeLevel"],
  career: ["companyName", "startDate", "endDate"],
  project: ["projectName", "startDate", "endDate"],
  languageTest: ["testName", "language", "acquisitionDate", "registrationNo"],
  languageSkill: ["language", "conversationalLevel"],
  certificate: ["name", "acquisitionDate", "registrationNo"],
  publicationPatent: ["title", "type", "details"],
  health: ["healthItemName", "healthDate", "healthStatusOrValue"],
};

/** Applies only selected fields; page row indexes never identify stored entries. */
export function mergeImportSelection(
  current: Profile,
  selection: ImportSelection,
  createId: () => string = () => crypto.randomUUID(),
): Profile {
  record(selection);
  if (
    Object.keys(selection).some(
      (key) =>
        !["personal", "contact", "education", "single", "entries"].includes(
          key,
        ),
    ) ||
    (selection.education !== undefined &&
      !Array.isArray(selection.education)) ||
    (selection.entries !== undefined && !Array.isArray(selection.entries))
  )
    throw new ImportSelectionError();
  const result = cloneProfile(current);
  let count = 0;
  const singles: Partial<Record<SingleProfileCategoryId, FieldValues>> = {};
  if (selection.single !== undefined) {
    record(selection.single);
    for (const [key, value] of Object.entries(selection.single)) {
      const definition = PROFILE_CATEGORIES.find(
        (category) => category.id === key && !category.repeatable,
      );
      if (!definition) throw new ImportSelectionError();
      singles[key as SingleProfileCategoryId] = selectedValues(
        value,
        definition.sections.flatMap((section) =>
          section.fields.map((field) => field.id),
        ),
      );
    }
  }
  for (const [key, allowed] of [
    ["personal", ["koreanFamilyName", "koreanGivenName"]],
    ["contact", ["email", "phoneNumber"]],
  ] as const) {
    if (selection[key] === undefined) continue;
    const legacy = selectedValues(selection[key], allowed);
    if (
      Object.keys(legacy).some((field) =>
        Object.hasOwn(singles[key] ?? {}, field),
      )
    )
      throw new ImportSelectionError();
    singles[key] = { ...singles[key], ...legacy };
  }
  for (const [key, values] of Object.entries(singles)) {
    const categoryId = key as SingleProfileCategoryId;
    const definitions = PROFILE_CATEGORIES.find(
      (category) => category.id === categoryId,
    )!.sections.flatMap((section) => section.fields);
    validateValues(values, definitions, current[categoryId]);
    Object.assign(result[categoryId], values);
    count += Object.keys(values).length;
  }
  const legacyEntries: ImportEntrySelection[] = (selection.education ?? []).map(
    (row) => {
      record(row);
      if (
        Object.keys(row).some(
          (key) => !["sourceRow", "targetId", "values"].includes(key),
        )
      )
        throw new ImportSelectionError();
      return {
        sourceRow: row.sourceRow,
        targetId: row.targetId,
        categoryId: "education" as const,
        sectionId: "university",
        values: selectedValues(row.values, [
          "schoolName",
          "startDate",
          "endDate",
        ]),
      };
    },
  );
  const rows = [...legacyEntries, ...(selection.entries ?? [])];
  const sources = new Set<string>();
  const targets = new Set<string>();
  const ids = new Set(
    REPEATED_CATEGORY_IDS.flatMap((category) =>
      current[category].map((entry) => entry.id),
    ),
  );
  const additions: {
    categoryId: RepeatedProfileCategoryId;
    entry: ProfileEntry;
  }[] = [];
  for (const row of rows) {
    record(row);
    if (
      Object.keys(row).some(
        (key) =>
          ![
            "categoryId",
            "sectionId",
            "sourceRow",
            "targetId",
            "values",
          ].includes(key),
      ) ||
      !Number.isInteger(row.sourceRow) ||
      row.sourceRow < 0
    )
      throw new ImportSelectionError();
    const category = PROFILE_CATEGORIES.find(
      (item) => item.id === row.categoryId && item.repeatable,
    );
    const section = category?.sections.find(
      (item) => item.id === row.sectionId,
    );
    if (!category || !section) throw new ImportSelectionError();
    const source = JSON.stringify([
      row.categoryId,
      row.sectionId,
      row.sourceRow,
    ]);
    if (sources.has(source)) throw new ImportSelectionError();
    sources.add(source);
    const values = selectedValues(
      row.values,
      section.fields.map((field) => field.id),
    );
    if (!Object.keys(values).length) throw new ImportSelectionError();
    const entries = result[row.categoryId];
    const identityKeys = ENTRY_KEYS[row.sectionId];
    const primary = identityKeys[0];
    let target: ProfileEntry;
    if (row.targetId !== undefined) {
      if (
        typeof row.targetId !== "string" ||
        !row.targetId.trim() ||
        targets.has(row.targetId)
      )
        throw new ImportSelectionError();
      targets.add(row.targetId);
      const matches = entries.filter((entry) => entry.id === row.targetId);
      if (matches.length !== 1 || matches[0].sectionId !== row.sectionId)
        throw new ImportSelectionError();
      target = matches[0];
      validateValues(values, section.fields, target.values);
      if (
        values[primary] !== undefined &&
        values[primary] !== target.values[primary] &&
        catalogKindForField(row.sectionId, primary)
      )
        target.identity = { status: "manual", originalText: values[primary] };
      Object.assign(target.values, values);
    } else {
      if (!values[primary]) throw new ImportSelectionError();
      validateValues(values, section.fields);
      const id = createId();
      if (typeof id !== "string" || !id.trim() || ids.has(id))
        throw new ImportSelectionError();
      ids.add(id);
      target = { id, sectionId: row.sectionId, values };
      if (catalogKindForField(row.sectionId, primary))
        target.identity = { status: "manual", originalText: values[primary] };
      additions.push({ categoryId: row.categoryId, entry: target });
    }
    count += Object.keys(values).length;
  }
  for (const { categoryId, entry } of additions) {
    const keys = ENTRY_KEYS[entry.sectionId];
    if (
      result[categoryId].some(
        (existing) =>
          existing.sectionId === entry.sectionId &&
          keys.every(
            (key) =>
              (existing.values[key] ?? "").trim() ===
              (entry.values[key] ?? "").trim(),
          ),
      )
    )
      throw new ImportSelectionError();
    result[categoryId].push(entry);
  }
  if (!count) throw new ImportSelectionError();
  return result;
}

/** Production storage compares and writes in the background queue; custom repositories may fall back. */
export async function saveImportSelection(
  repository: ProfileRepository,
  baseline: Profile,
  selection: ImportSelection,
): Promise<Profile> {
  const expected = cloneProfile(baseline);
  const selected = structuredClone(selection);
  const latest = await repository.load();
  if (!profilesEqual(expected, latest)) throw new ImportConflictError();
  const result = mergeImportSelection(latest, selected);
  if (repository.saveIfUnchanged) {
    if (!(await repository.saveIfUnchanged(expected, result)))
      throw new ImportConflictError();
  } else {
    await repository.save(result);
  }
  return result;
}
