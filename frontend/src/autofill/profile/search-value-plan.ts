export interface SearchGradeCandidate {
  profileEntryId: string;
  grade: string;
}

export interface LocalSearchValueForm {
  kind: "original-exact" | "name-and-grade";
  name: string;
  grade?: string;
}

export interface LocalSearchValuePlan {
  profileEntryId: string;
  originalName: string;
  grade?: string;
  forms: readonly LocalSearchValueForm[];
}

export interface BuildLocalSearchValuePlanInput {
  profileEntryId: string;
  originalName: string;
  gradeCandidates: readonly SearchGradeCandidate[];
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function uniqueSameEntryGrade(
  gradeCandidates: readonly SearchGradeCandidate[],
  profileEntryId: string,
): string | undefined {
  if (gradeCandidates.length !== 1) return undefined;
  const candidate = gradeCandidates[0]!;
  const grade = normalized(candidate.grade);
  return candidate.profileEntryId === profileEntryId && grade
    ? grade
    : undefined;
}

function splitForm(
  originalName: string,
  grade: string | undefined,
): LocalSearchValueForm | undefined {
  const name = normalized(originalName);
  if (!grade || !name.endsWith(grade)) return undefined;
  const gradeStart = name.length - grade.length;
  const separator = name[gradeStart - 1] === " " ? " " : "";
  const splitName = name.slice(0, gradeStart).trimEnd();
  if (!splitName || normalized(`${splitName}${separator}${grade}`) !== name) {
    return undefined;
  }
  return { kind: "name-and-grade", name: splitName, grade };
}

export function buildLocalSearchValuePlan({
  profileEntryId,
  originalName,
  gradeCandidates,
}: BuildLocalSearchValuePlanInput): LocalSearchValuePlan {
  const grade = uniqueSameEntryGrade(gradeCandidates, profileEntryId);
  const split = splitForm(originalName, grade);
  const forms = Object.freeze([
    Object.freeze({ kind: "original-exact" as const, name: originalName }),
    ...(split ? [Object.freeze(split)] : []),
  ]);
  return Object.freeze({
    profileEntryId,
    originalName,
    ...(grade ? { grade } : {}),
    forms,
  });
}
