import type { ProfileEntry } from "../../profile/model";

export type EducationRowKind =
  "HIGH_SCHOOL" | "JUNIOR_COLLEGE" | "UNIVERSITY" | "MASTER" | "DOCTOR";

export type EducationSectionId = "highSchool" | "university" | "graduateSchool";

const SECTION_OF_KIND: Record<EducationRowKind, EducationSectionId> = {
  HIGH_SCHOOL: "highSchool",
  JUNIOR_COLLEGE: "university",
  UNIVERSITY: "university",
  MASTER: "graduateSchool",
  DOCTOR: "graduateSchool",
};

/**
 * Standard education choices from field-definitions (section labels,
 * schoolType, degreeLevel and latestEducationType). Only exact matches count;
 * integrated master/doctor programs have no single kind and stay unmapped.
 */
const KIND_OF_TEXT: ReadonlyMap<string, EducationRowKind> = new Map([
  ["고등학교", "HIGH_SCHOOL"],
  ["전문대학", "JUNIOR_COLLEGE"],
  ["전문대학(전문학사)", "JUNIOR_COLLEGE"],
  ["대학교", "UNIVERSITY"],
  ["대학(학사)", "UNIVERSITY"],
  ["대학원(석사)", "MASTER"],
  ["석사", "MASTER"],
  ["대학원(박사)", "DOCTOR"],
  ["박사", "DOCTOR"],
]);

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function sectionOfKind(kind: EducationRowKind): EducationSectionId {
  return SECTION_OF_KIND[kind];
}

/** Map a visible option text to a kind; never a substring or value match. */
export function kindOfOptionText(text: string): EducationRowKind | undefined {
  return KIND_OF_TEXT.get(normalize(text));
}

const UNIVERSITY_SCHOOL_TYPE: Readonly<Record<string, EducationRowKind>> = {
  전문대학: "JUNIOR_COLLEGE",
  대학교: "UNIVERSITY",
};
const UNIVERSITY_DEGREE: Readonly<Record<string, EducationRowKind>> = {
  전문학사: "JUNIOR_COLLEGE",
  학사: "UNIVERSITY",
};
const GRADUATE_DEGREE: Readonly<Record<string, EducationRowKind>> = {
  석사: "MASTER",
  박사: "DOCTOR",
};

export function kindOfEntry(entry: ProfileEntry): EducationRowKind | undefined {
  const schoolType = normalize(entry.values.schoolType ?? "");
  const degreeLevel = normalize(entry.values.degreeLevel ?? "");
  switch (entry.sectionId) {
    case "highSchool":
      return "HIGH_SCHOOL";
    case "university":
      return (
        UNIVERSITY_SCHOOL_TYPE[schoolType] ?? UNIVERSITY_DEGREE[degreeLevel]
      );
    case "graduateSchool":
      return GRADUATE_DEGREE[degreeLevel];
    default:
      return undefined;
  }
}
