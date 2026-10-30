import type { Profile } from "../../profile/model";
import { normalizeProfileOptionValue } from "./standard-profile-option";

const HIGH_SCHOOL_NAME = "education.highSchool.schoolName";
const HIGH_SCHOOL_REGION = "education.highSchool.schoolRegion";

/**
 * Standard region label ("서울") stored on the same high-school entry as the
 * searched school name. Local evidence for choosing among same-name options;
 * never sent to the backend. Unknown or empty regions yield undefined.
 */
export function highSchoolSearchRegion(
  profile: Profile,
  profileFieldKey: string,
  profileEntryId: string | undefined,
): string | undefined {
  if (profileFieldKey !== HIGH_SCHOOL_NAME) return undefined;
  const entries = profile.education.filter(
    (entry) =>
      entry.sectionId === "highSchool" &&
      (profileEntryId === undefined || entry.id === profileEntryId),
  );
  if (entries.length !== 1) return undefined;
  return (
    normalizeProfileOptionValue(
      HIGH_SCHOOL_REGION,
      entries[0].values.schoolRegion ?? "",
    ) || undefined
  );
}
