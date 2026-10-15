import { executionPolicy } from "../workflow/execution-policy";
export const componentSelectorKeys = [
  "field",
  "addressResults",
  "openDialog",
  "dialogClose",
  "unnamedEmail",
  "row",
  "fieldLabel",
  "radioGroup",
  "radioOption",
  "addTrigger",
  "section",
  "extraFields",
  "openSearchPopup",
  "scrollRoot",
  "searchPositioner",
  "checkedItem",
  "optionDetail",
  "optionDecoration",
  "searchInput",
  "searchItem",
  "checkedSearchItem",
  "codedSearchItem",
  "searchOption",
  "searchPopup",
  "choicePopup",
  "calendarTrigger",
  "calendarPopup",
  "calendarInput",
  "calendarCells",
  "calendarClear",
  "calendarRoot",
  "fieldGroup",
  "calendarValue",
  "collectedRadioOption",
] as const;
export type ComponentSelectorKey = (typeof componentSelectorKeys)[number];
export type ComponentSelectors = Record<ComponentSelectorKey, string>;
export function validComponentSelectors(
  value: unknown,
  required: readonly string[] = componentSelectorKeys,
): value is ComponentSelectors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selectors = value as Record<string, unknown>;
  if (!required.every((key) => typeof selectors[key] === "string"))
    return false;
  return Object.keys(selectors).every((key) => {
    const selector = selectors[key];
    if (typeof selector !== "string" || !selector || selector.length > 2000)
      return false;
    try {
      if (typeof document !== "undefined")
        document
          .createDocumentFragment()
          .querySelector(selector.replace(/\{\d+\}/g, "value"));
      return true;
    } catch {
      return false;
    }
  });
}
export function componentSelector(
  source: Node | null | undefined,
  key: ComponentSelectorKey,
  values: string[] = [],
): string {
  const doc =
    source?.nodeType === 9 ? (source as Document) : source?.ownerDocument;
  const selector =
    doc && executionPolicy(doc)?.componentPolicy?.selectors?.[key];
  if (!selector) return ":not(*)";
  return selector.replace(/\{(\d+)\}/g, (_, index) => {
    if (values[Number(index)] === undefined)
      throw new Error("Missing selector parameter");
    return CSS.escape(values[Number(index)]);
  });
}
