import { schoolRegionSearchValues } from "../../profile/standard-values";
import { normalized } from "./readonly-search";
import type { SearchSurface } from "./search-surface";
import {
  displayedControl,
  elements,
  interactive,
  label,
} from "./search-surface-dom";

/** Another stored value of the same profile entry; local only, never sent. */
export interface SearchContextValue {
  key: string;
  value: string;
}

export interface QueryGate {
  select: HTMLSelectElement;
  option: HTMLOptionElement;
}

function namesOf({ key, value }: SearchContextValue): readonly string[] {
  return key.endsWith(".schoolRegion")
    ? schoolRegionSearchValues(value)
    : [value];
}

/**
 * Some search layers keep their one query input disabled until a select in
 * the layer (for example a region) is chosen. The gate is that select and the
 * one option a stored value of the same entry names exactly.
 */
export function queryGate(
  surface: SearchSurface,
  contexts: readonly SearchContextValue[] | undefined,
): QueryGate | undefined {
  if (!contexts?.length) return undefined;
  const root = surface.container;
  const locked = elements<HTMLInputElement>(root, "input").filter(
    (input) =>
      ["text", "search"].includes(input.type) &&
      !input.readOnly &&
      input.matches(":disabled") &&
      displayedControl(input) &&
      /검색|조회|찾기|search|query|keyword/i.test(label(input)),
  );
  const selects = elements<HTMLSelectElement>(root, "select").filter(
    interactive,
  );
  if (locked.length !== 1 || selects.length !== 1) return undefined;
  const select = selects[0]!;
  const names = new Set(
    contexts.flatMap(namesOf).map(normalized).filter(Boolean),
  );
  const options = [...select.options].filter(
    (option) =>
      !option.disabled &&
      option.value !== "" &&
      names.has(normalized(option.textContent ?? "")),
  );
  return options.length === 1 ? { select, option: options[0]! } : undefined;
}

export function chooseQueryGate({ select, option }: QueryGate): boolean {
  const view = select.ownerDocument.defaultView;
  const setter = view
    ? Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype, "value")
        ?.set
    : undefined;
  if (!view || !setter) return false;
  setter.call(select, option.value);
  select.dispatchEvent(new view.Event("input", { bubbles: true }));
  select.dispatchEvent(new view.Event("change", { bubbles: true }));
  return select.selectedOptions[0] === option;
}
