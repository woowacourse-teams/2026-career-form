import { componentRules } from "../runtime-rules";
import {
  componentPolicy,
  componentCapability,
  componentPattern,
} from "../../policy/component-policy";
import { universityAdditionalMajors } from "../../profile/university-additional-majors";
import type { Profile } from "../../../profile/model";

export const educationMajorAdd = (document: Document) =>
  componentPattern(document, "majorAction");
export function graduateMajorProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
  document: Document,
): number | null | undefined {
  if (!componentCapability(document, "nestedRepeat")) return undefined;
  const match = educationMajorAdd(document).exec(actionDomId ?? "");
  if (!match) return undefined;
  const index = Number(match[2]);
  if (index > componentRules(document).row.maxIndex) return null;
  const policy = componentPolicy(document);
  const section =
    policy.profileSections[policy.actionPrefix + match[1]]?.sectionId;
  if (!section) return null;
  const entry = profile[componentRules(document).major.sourceCategory].filter(
    (entry) => entry.sectionId === section,
  )[index];
  if (!entry) return null;
  const majors = universityAdditionalMajors(entry.values);
  return majors
    ? componentRules(document).major.baseCount + majors.length
    : null;
}
