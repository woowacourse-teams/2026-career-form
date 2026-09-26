const CONTROL_SELECTOR =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']), select, textarea";
const SINGLE_ROW_MARKER =
  "[ismultirow='true' i], [data-multirow='true' i], [data-repeatable-row]";
const ACTION_SELECTOR = "button, input[type='button']";
const ADD_LABEL = /추가|add/i;
const FORBIDDEN_LABEL =
  /저장|제출|완료|다음|이전|삭제|업로드|검색|조회|찾기|submit|save|next|previous|delete|upload|search|find|lookup/i;

export interface GenericFormGroup {
  area: Element;
  displayName: string;
  rows: Element[];
  action: HTMLElement;
  maximumRows?: number | "ambiguous";
}

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function groupTitle(area: Element): string {
  return normalizedText(
    area.querySelector(
      ":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6",
    ),
  );
}

function controls(row: Element): Element[] {
  return Array.from(row.querySelectorAll(CONTROL_SELECTOR)).filter(
    (control) => !control.closest("[hidden], [aria-hidden='true'], [inert]"),
  );
}

function actionLabel(action: HTMLElement): string {
  return [
    action.textContent,
    action.getAttribute("aria-label"),
    action.getAttribute("title"),
    action instanceof HTMLInputElement ? action.value : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function addActions(area: Element, rows: readonly Element[]): HTMLElement[] {
  return Array.from(area.querySelectorAll<HTMLElement>(ACTION_SELECTOR)).filter(
    (action) => {
      const label = actionLabel(action);
      return (
        !rows.some((row) => row.contains(action)) &&
        ADD_LABEL.test(label) &&
        !FORBIDDEN_LABEL.test(label) &&
        !action.closest("[hidden], [aria-hidden='true'], [inert]")
      );
    },
  );
}

function maximumRows(
  area: Element,
  action: HTMLElement,
): number | "ambiguous" | undefined {
  const rawValues = [area, action]
    .flatMap((element) =>
      ["data-max-items", "data-max-rows", "data-maximum-items"]
        .map((name) => element.getAttribute(name))
        .filter((value): value is string => Boolean(value)),
    )
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0);
  const textMatch = area.textContent?.match(/최대\s*(\d+)\s*(?:개|건|항목)/);
  if (textMatch) rawValues.push(Number(textMatch[1]));
  const values = [...new Set(rawValues)];
  return values.length > 1 ? "ambiguous" : values[0];
}

function candidateRows(area: Element, seed: Element): Element[] {
  const candidates = Array.from(
    area.querySelectorAll(SINGLE_ROW_MARKER),
  ).filter((row) => controls(row).length >= 2);
  if (!candidates.includes(seed)) candidates.unshift(seed);
  return candidates.filter(
    (row) =>
      !candidates.some((parent) => parent !== row && parent.contains(row)),
  );
}

function groupFromSeed(seed: Element): GenericFormGroup | undefined {
  if (!seed.matches(SINGLE_ROW_MARKER) || controls(seed).length < 2) {
    return undefined;
  }
  let area = seed.parentElement;
  for (
    let depth = 0;
    area && depth < 5;
    depth += 1, area = area.parentElement
  ) {
    if (area.matches("form, body")) break;
    const displayName = groupTitle(area);
    if (!displayName) continue;
    const rows = candidateRows(area, seed);
    const actions = addActions(area, rows);
    if (actions.length === 1) {
      const action = actions[0]!;
      const maximum = maximumRows(area, action);
      return {
        area,
        displayName,
        rows,
        action,
        ...(maximum === undefined ? {} : { maximumRows: maximum }),
      };
    }
  }
  return undefined;
}

export function genericFormGroups(root: ParentNode): GenericFormGroup[] {
  const groups: GenericFormGroup[] = [];
  for (const seed of Array.from(root.querySelectorAll(SINGLE_ROW_MARKER))) {
    const group = groupFromSeed(seed);
    if (
      group &&
      !groups.some(
        (existing) =>
          existing.area === group.area && existing.action === group.action,
      )
    ) {
      groups.push(group);
    }
  }
  return groups;
}

export function genericFormGroupFor(
  element: Element,
): GenericFormGroup | undefined {
  return genericFormGroups(element.ownerDocument).find(
    (group) =>
      group.action === element ||
      group.rows.some((row) => row === element || row.contains(element)),
  );
}
