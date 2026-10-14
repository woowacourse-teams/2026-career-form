import { componentRules } from "../runtime-rules";
import { componentPolicy } from "../../policy/component-policy";
export type ComponentSectionKind = string;
export const componentSections = (document: Document) =>
  componentPolicy(document).sections;
export function componentSectionPrefix(
  kind: string,
  document: Document,
): string {
  const section = componentSections(document)[kind];
  return `${section.prefix}${section.singleton ? "" : componentRules(document).row.separator}`;
}
