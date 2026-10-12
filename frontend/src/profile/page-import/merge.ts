import { formatProfileDate } from "../../autofill/profile/date-format";
import type { FieldValues, Profile, ProfileEntry } from "../model";
import {
  cloneProfile,
  profilesEqual,
  REPEATED_CATEGORY_IDS,
  type ProfileRepository,
} from "../profile-repository";

export interface ImportSelection {
  personal?: { koreanFamilyName?: string; koreanGivenName?: string };
  contact?: { email?: string; phoneNumber?: string };
  education: {
    sourceRow: number;
    targetId?: string;
    values: { schoolName?: string; startDate?: string; endDate?: string };
  }[];
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
      "선택한 정보를 확인해 주세요. 중복 학력이나 불완전한 값은 저장할 수 없습니다.",
    );
    this.name = "ImportSelectionError";
  }
}

const SCHOOL_FIELDS = ["schoolName", "startDate", "endDate"] as const;

function selectedValues(
  value: unknown,
  allowed: readonly string[],
): FieldValues {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ImportSelectionError();
  const entries = Object.entries(value);
  for (const [key, text] of entries) {
    if (!allowed.includes(key) || typeof text !== "string" || !text.trim())
      throw new ImportSelectionError();
  }
  return Object.fromEntries(
    entries.map(([key, text]) => [key, (text as string).trim()]),
  );
}

function sameUniversity(a: ProfileEntry, b: ProfileEntry): boolean {
  return (
    a.sectionId === "university" &&
    b.sectionId === "university" &&
    SCHOOL_FIELDS.every(
      (key) => (a.values[key] ?? "").trim() === (b.values[key] ?? "").trim(),
    )
  );
}

/** Applies only explicitly selected fields. DOM row indexes never identify stored entries. */
export function mergeImportSelection(
  current: Profile,
  selection: ImportSelection,
  createId: () => string = () => crypto.randomUUID(),
): Profile {
  if (
    !selection ||
    Object.keys(selection).some(
      (key) => !["personal", "contact", "education"].includes(key),
    ) ||
    !Array.isArray(selection.education)
  )
    throw new ImportSelectionError();
  const personal =
    selection.personal === undefined
      ? {}
      : selectedValues(selection.personal, [
          "koreanFamilyName",
          "koreanGivenName",
        ]);
  const contact =
    selection.contact === undefined
      ? {}
      : selectedValues(selection.contact, ["email", "phoneNumber"]);
  if (
    contact.email !== undefined &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
  )
    throw new ImportSelectionError();
  if (
    contact.phoneNumber !== undefined &&
    !/^0\d{9,10}$/.test(contact.phoneNumber)
  )
    throw new ImportSelectionError();
  if (
    !Object.keys(personal).length &&
    !Object.keys(contact).length &&
    !selection.education.length
  )
    throw new ImportSelectionError();
  const result = cloneProfile(current);
  Object.assign(result.personal, personal);
  Object.assign(result.contact, contact);
  const sourceRows = new Set<number>();
  const targetIds = new Set<string>();
  const ids = new Set(
    REPEATED_CATEGORY_IDS.flatMap((category) =>
      current[category].map((entry) => entry.id),
    ),
  );
  const additions: ProfileEntry[] = [];
  for (const row of selection.education) {
    if (
      !row ||
      Object.keys(row).some(
        (key) => !["sourceRow", "targetId", "values"].includes(key),
      ) ||
      !Number.isInteger(row.sourceRow) ||
      row.sourceRow < 0 ||
      sourceRows.has(row.sourceRow)
    )
      throw new ImportSelectionError();
    sourceRows.add(row.sourceRow);
    const values = selectedValues(row.values, SCHOOL_FIELDS);
    if (!Object.keys(values).length) throw new ImportSelectionError();
    for (const key of ["startDate", "endDate"] as const) {
      if (
        values[key] !== undefined &&
        formatProfileDate(values[key], "YYYY-MM-DD").status !== "resolved"
      )
        throw new ImportSelectionError();
    }
    if (row.targetId !== undefined) {
      if (targetIds.has(row.targetId)) throw new ImportSelectionError();
      targetIds.add(row.targetId);
      const matches = result.education.filter(
        (entry) => entry.id === row.targetId,
      );
      if (matches.length !== 1 || matches[0].sectionId !== "university")
        throw new ImportSelectionError();
      const target = matches[0];
      if (
        values.schoolName !== undefined &&
        values.schoolName !== target.values.schoolName
      )
        target.identity = { status: "manual", originalText: values.schoolName };
      Object.assign(target.values, values);
    } else {
      if (values.schoolName === undefined) throw new ImportSelectionError();
      const id = createId();
      if (typeof id !== "string" || !id.trim() || ids.has(id))
        throw new ImportSelectionError();
      ids.add(id);
      const entry: ProfileEntry = { id, sectionId: "university", values };
      if (values.schoolName !== undefined)
        entry.identity = { status: "manual", originalText: values.schoolName };
      additions.push(entry);
    }
  }
  for (const entry of additions) {
    if (result.education.some((existing) => sameUniversity(existing, entry)))
      throw new ImportSelectionError();
    result.education.push(entry);
  }
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
