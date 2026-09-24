import {
  SCHOOL_REGION_OPTIONS,
  schoolRegionOption,
} from "../../profile/standard-values";
import { controlSignature, normalized } from "./readonly-search";
import {
  elements,
  interactive,
  safeActivation,
  shown,
} from "./search-surface-dom";
import type { SearchSurface } from "./search-surface";

const SCHOOL_REGION_KEY =
  /^education\.(highSchool|university|graduateSchool)\.schoolRegion$/;
const DOMESTIC_REGIONS = SCHOOL_REGION_OPTIONS.filter(
  (option) => option.value !== "region:overseas",
);

/** A complete, queryless domestic region set, independent of site host or callback name. */
export function completeRegionList(
  surface: SearchSurface,
  canonicalFieldKey: string,
): HTMLElement | undefined {
  if (
    !SCHOOL_REGION_KEY.test(canonicalFieldKey) ||
    surface.kind !== "same-origin-iframe" ||
    !surface.frame ||
    surface.frame.contentDocument !== surface.document
  )
    return undefined;
  const root = surface.document;
  const countries = elements<HTMLSelectElement>(root, "select").filter(
    interactive,
  );
  if (
    countries.length !== 1 ||
    !["KOR", "KR"].includes(countries[0]!.value.toUpperCase()) ||
    !["한국", "대한민국"].includes(
      normalized(countries[0]!.selectedOptions[0]?.textContent ?? ""),
    ) ||
    elements<HTMLElement>(
      root,
      "input:not([type='hidden']), textarea, button[type='submit']",
    ).some(interactive)
  )
    return undefined;
  const lists = elements<HTMLElement>(
    root,
    "ul, ol, [role='listbox'], table",
  ).filter((list) => {
    if (!shown(list)) return false;
    const actions = elements<HTMLElement>(
      list,
      "a, button, [role='option']",
    ).filter((item) => !item.querySelector("a, button, [role='option']"));
    if (
      actions.length !== DOMESTIC_REGIONS.length ||
      elements(list, "a, button, [role='option']").length !== actions.length ||
      actions.some((item) => !safeActivation(item, [item.textContent ?? ""]))
    )
      return false;
    const keys = actions.map(
      (item) => schoolRegionOption(item.textContent ?? "")?.value,
    );
    return (
      keys.every((value) => value && value !== "region:overseas") &&
      new Set(keys).size === DOMESTIC_REGIONS.length &&
      DOMESTIC_REGIONS.every((option) => keys.includes(option.value))
    );
  });
  // An unrelated second matching list makes the surface ambiguous.
  return lists.length === 1 ? lists[0] : undefined;
}

export function regionListSelection(
  surface: SearchSurface,
  canonicalFieldKey: string,
  acceptedValues: readonly string[],
): { element: HTMLElement; signature: string } | undefined {
  const list = completeRegionList(surface, canonicalFieldKey);
  if (!list) return undefined;
  const accepted = new Set(acceptedValues.map(normalized));
  const matches = elements<HTMLElement>(
    list,
    "a, button, [role='option']",
  ).filter((item) => accepted.has(normalized(item.textContent ?? "")));
  if (matches.length !== 1 || !safeActivation(matches[0]!, acceptedValues))
    return undefined;
  const element = matches[0]!;
  return { element, signature: controlSignature(element) };
}
