import { universityAdditionalMajors } from "../../profile/university-additional-majors";
import type { Profile } from "../../../profile/model";

export const educationMajorAdd =
  /^greeting:add:(universities|graduateSchools):(0|[1-9]\d*):majors$/;
export const graduateMajorAdd =
  /^greeting:add:graduateSchools:(0|[1-9]\d*):majors$/;
const additionalMajorTypes = new Set([
  "복수전공",
  "부전공",
  "연계전공",
  "융합전공",
]);
const majorFields = new Set([
  "인문계열",
  "사회계열",
  "교육계열",
  "공학계열",
  "자연과학계열",
  "의약학계열",
  "예체능계열",
  "농수해양/생명자원계열",
  "기타",
]);
export function graduateMajorProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
): number | null | undefined {
  const match = educationMajorAdd.exec(actionDomId ?? "");
  if (!match) return undefined;
  const index = Number(match[2]);
  if (index > 127) return null;
  if (match[1] === "universities") {
    const university = profile.education.filter(
      (entry) => entry.sectionId === "university",
    )[index];
    if (!university) return null;
    const majors = universityAdditionalMajors(university.values);
    return majors ? 1 + majors.length : null;
  }
  const graduate = profile.education.filter(
    (entry) => entry.sectionId === "graduateSchool",
  )[index];
  if (!graduate) return null;
  const classification = graduate.values.additionalMajorClassification?.trim();
  const field = graduate.values.additionalMajorField?.trim();
  const name = graduate.values.additionalMajorName?.trim();
  if (!classification && !field && !name) return 1;
  return classification &&
    field &&
    name &&
    additionalMajorTypes.has(classification) &&
    majorFields.has(field)
    ? 2
    : null;
}
