import { calendarUnitEvidence } from "../interaction/calendar-unit";
import { fieldGroupFor, searchOpeners } from "../interaction/readonly-search";
import { isSafeSurfaceCloseClick } from "../generic/click-policy";
import { labelOf } from "./metadata";
import {
  captureDropdownProbe,
  closeDropdown,
  dropdownIsCurrent,
  dropdownText,
  observeEffect,
  openDropdown,
  revalidateDropdown,
  visible,
  type ButtonDropdown,
} from "./button-dropdown";

/**
 * A readonly text input can itself be the opener of a custom select. The
 * input is clicked only when no other opener shares its field group, and the
 * result is accepted only when exactly one new surface appears.
 */

const SURFACES =
  "[role='listbox'], [role='menu'], [role='dialog'], dialog[open], ul, ol";
const LISTS = "[role='listbox'], [role='menu'], ul, ol";
const UNSAFE_IN_LIST =
  "input, select, textarea, [contenteditable='true'], a[href], button:not([type='button']), [role='combobox'], table, [role='grid']";
const OTHER_OPENERS =
  "button, [role='button'], a[href], input[type='button'], input[type='submit'], input[type='image'], input[type='reset']";
// A calendar cell list is never a select list.
const CALENDAR_CELL = /^\d{1,4}\s*(?:년|월|일)?$/;
// Date-like fields open calendars, which the calendar executors own.
const DATE_WORDS =
  /날짜|일자|기간|연월|년월|생년|\bdate\b|\bperiod\b|\bmonth\b|\byear\b/i;
const PROBE_MS = 400;
const OPEN_MS = 1000;

export type InputSurface =
  | {
      kind: "list";
      menu: HTMLElement;
      options: ButtonDropdown["options"];
    }
  | { kind: "dialog"; dialog: HTMLElement };

function relatedIds(input: HTMLInputElement): string[] {
  return ["aria-controls", "aria-owns"].flatMap(
    (name) =>
      input.getAttribute(name)?.trim().split(/\s+/).filter(Boolean) ?? [],
  );
}

function controlledList(input: HTMLInputElement): HTMLElement | undefined {
  const ids = relatedIds(input);
  if (ids.length !== 1) return undefined;
  const element = input.ownerDocument.getElementById(ids[0]!);
  return element?.matches("[role='listbox'], [role='menu']")
    ? element
    : undefined;
}

/** ARIA declares a custom select: combobox, popup, or an owned listbox. */
export function declaresPopup(input: HTMLInputElement): boolean {
  if (input.getAttribute("role") === "combobox") return true;
  const popup = input.getAttribute("aria-haspopup")?.trim().toLowerCase();
  if (popup && ["listbox", "menu", "dialog", "true"].includes(popup))
    return true;
  return controlledList(input) !== undefined;
}

export function canOpenItself(input: HTMLInputElement): boolean {
  if (
    input.type !== "text" ||
    !input.readOnly ||
    input.disabled ||
    !visible(input) ||
    input.closest(
      "a[href], header, nav, [role='navigation'], [aria-disabled='true'], [inert]",
    ) ||
    Array.from(input.attributes).some((attribute) =>
      /^form/i.test(attribute.name),
    ) ||
    // Date inputs belong to the calendar executors.
    calendarUnitEvidence(input) !== undefined ||
    DATE_WORDS.test(
      [labelOf(input, true), input.getAttribute("placeholder")].join(" "),
    )
  )
    return false;
  const group = fieldGroupFor(input);
  if (!group) return false;
  if (declaresPopup(input)) return searchOpeners(group).length === 0;
  return !Array.from(group.querySelectorAll<HTMLElement>(OTHER_OPENERS)).some(
    (element) => element !== input && visible(element),
  );
}

function outermost(elements: readonly HTMLElement[]): HTMLElement[] {
  return elements.filter(
    (element) =>
      !elements.some(
        (parent) => parent !== element && parent.contains(element),
      ),
  );
}

function visibleSurfaces(document: Document): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SURFACES)).filter(
    visible,
  );
}

/**
 * Click the input once and return every outermost surface that newly appeared.
 * `mounted` receives any other visible subtree the click mounted, so a probe
 * can close what it opened even when it is not a recognized surface.
 */
export async function openInputSurface(
  input: HTMLInputElement,
  signal?: AbortSignal,
  timeoutMs = OPEN_MS,
  mounted?: HTMLElement[],
): Promise<HTMLElement[]> {
  const document = input.ownerDocument;
  const before = new Set(visibleSurfaces(document));
  const added: HTMLElement[] = [];
  const collect = (records: MutationRecord[]) =>
    records.forEach((record) =>
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) added.push(node);
      }),
    );
  const observer = new MutationObserver(collect);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const fresh = () =>
    outermost(
      visibleSurfaces(document).filter(
        (surface) => !before.has(surface) && !surface.contains(input),
      ),
    );
  try {
    if (signal?.aborted) return [];
    await observeEffect(
      document,
      () => input.click(),
      () => (fresh().length ? true : undefined),
      signal,
      timeoutMs,
    );
    // A sibling surface mounted in the same task is still part of this opening.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return fresh();
  } finally {
    collect(observer.takeRecords());
    observer.disconnect();
    mounted?.push(
      ...outermost(
        added.filter(
          (element) =>
            element.isConnected && visible(element) && !element.contains(input),
        ),
      ),
    );
  }
}

function listOptions(menu: HTMLElement): ButtonDropdown["options"] | undefined {
  if (menu.querySelector(UNSAFE_IN_LIST)) return undefined;
  const roled = Array.from(
    menu.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem']"),
  );
  const items = roled.length
    ? roled
    : menu.matches("ul, ol") &&
        Array.from(menu.children).every((child) => child.tagName === "LI")
      ? Array.from(menu.children as HTMLCollectionOf<HTMLElement>)
      : [];
  if (items.length < (roled.length ? 1 : 2) || items.length > 128)
    return undefined;
  const texts = items.map(dropdownText);
  if (
    texts.some((text) => !text || text.length > 120) ||
    texts.every((text) => CALENDAR_CELL.test(text))
  )
    return undefined;
  return items.map((element, index) => ({
    element,
    text: texts[index] ?? "",
  }));
}

/** An option list or a dialog with exactly one search box; anything else is unknown. */
export function classifySurface(
  surface: HTMLElement,
  input: HTMLInputElement,
): InputSurface | undefined {
  if (surface.matches("table, [role='grid']")) return undefined;
  if (surface.matches("[role='dialog'], dialog")) {
    const queries = Array.from(
      surface.querySelectorAll<HTMLInputElement>("input"),
    ).filter(
      (query) =>
        ["text", "search"].includes(query.type) &&
        !query.readOnly &&
        !query.disabled &&
        visible(query),
    );
    if (queries.length === 1) return { kind: "dialog", dialog: surface };
    if (queries.length) return undefined;
  }
  const lists = surface.matches(LISTS)
    ? [surface]
    : outermost(Array.from(surface.querySelectorAll<HTMLElement>(LISTS)));
  const menu = lists.length === 1 ? lists[0] : undefined;
  if (!menu) return undefined;
  // A declared listbox relation must name exactly this list.
  const declared = controlledList(input);
  if (declared && declared !== menu) return undefined;
  const options = listOptions(menu);
  return options ? { kind: "list", menu, options } : undefined;
}

export async function closeInputSurface(
  input: HTMLInputElement,
  surfaces: readonly HTMLElement[],
): Promise<boolean> {
  const closed = () =>
    surfaces.every((surface) => !visible(surface)) ? true : undefined;
  if (closed()) return true;
  const document = input.ownerDocument;
  const steps = [
    () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    () =>
      document.body?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      ),
    () => input.blur(),
    // A list that its input toggles closes on a second click of that input.
    () => input.click(),
    () => {
      const closers = surfaces.flatMap((surface) =>
        Array.from(
          surface.querySelectorAll<HTMLElement>("button, [role='button']"),
        ).filter((button) => isSafeSurfaceCloseClick(button, surface).allowed),
      );
      if (closers.length === 1) closers[0]!.click();
    },
  ];
  for (const step of steps)
    if ((await observeEffect(document, step, closed, undefined, 300)) === true)
      return true;
  return closed() === true;
}

export interface ReadonlyInputProbe {
  readonly dropdowns: ReadonlyMap<HTMLElement, ButtonDropdown>;
  /** Inputs whose own click opened one dialog with one search box. */
  readonly searchDialogs: ReadonlySet<HTMLInputElement>;
}

/** `canClick` rejects an input before it is opened; rejected inputs are never clicked. */
export async function collectReadonlyInputDropdowns(
  document: Document,
  signal?: AbortSignal,
  canClick?: (input: HTMLInputElement) => boolean,
): Promise<ReadonlyInputProbe> {
  const dropdowns = new Map<HTMLElement, ButtonDropdown>();
  const searchDialogs = new Set<HTMLInputElement>();
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("input[readonly]"),
  ).filter(canOpenItself);
  for (const input of inputs) {
    if (signal?.aborted) break;
    if (canClick && !canClick(input)) continue;
    const field = input.parentElement;
    const scope = fieldGroupFor(input);
    if (!field || !(scope instanceof HTMLElement)) continue;
    const probe = captureDropdownProbe(document);
    const initialText = dropdownText(input);
    let opened: HTMLElement[] = [];
    const mounted: HTMLElement[] = [];
    let surface: InputSurface | undefined;
    let intact = false;
    try {
      opened = await openInputSurface(input, signal, PROBE_MS, mounted);
      intact = probe.unchanged();
      surface =
        intact && opened.length === 1
          ? classifySurface(opened[0]!, input)
          : undefined;
    } finally {
      try {
        const others = mounted.filter(
          (element) => !opened.some((surface) => surface.contains(element)),
        );
        // Unrecognized mounted subtrees are closed on a best-effort basis;
        // a recognized surface that stays open stops collection.
        const closed =
          (await closeInputSurface(input, [...opened, ...others])) ||
          opened.every((element) => !visible(element));
        if (!probe.unchanged()) {
          intact = false;
          if (!probe.interrupted() && !probe.restore())
            throw new Error(
              "선택 목록 확인 중 변경된 지원서 값을 복구할 수 없습니다.",
            );
        }
        if (!closed)
          throw new Error("선택 목록 확인 후 목록을 닫을 수 없습니다.");
      } finally {
        probe.release();
      }
    }
    if (!intact || !surface || signal?.aborted) continue;
    if (surface.kind === "dialog") {
      searchDialogs.add(input);
      continue;
    }
    dropdowns.set(input, {
      trigger: input,
      field,
      scope,
      scopeId: scope.id,
      menu: surface.menu,
      initialText,
      controls: input.getAttribute("aria-controls"),
      options: surface.options,
      surface: "input",
    });
  }
  return { dropdowns, searchDialogs };
}

export function openDropdownFor(
  dropdown: ButtonDropdown,
  signal?: AbortSignal,
): Promise<HTMLElement[]> {
  return dropdown.surface === "input"
    ? openInputSurface(dropdown.trigger as HTMLInputElement, signal)
    : openDropdown(dropdown.trigger, signal);
}

export function closeDropdownFor(
  dropdown: ButtonDropdown,
  menus: readonly HTMLElement[],
): Promise<boolean> {
  return dropdown.surface === "input"
    ? closeInputSurface(dropdown.trigger as HTMLInputElement, menus)
    : closeDropdown(dropdown.trigger, menus);
}

/** The live option list; a list mounted on demand may be a new element. */
export function liveDropdownMenu(
  dropdown: ButtonDropdown,
  menus: readonly HTMLElement[],
): HTMLElement | undefined {
  if (dropdown.surface !== "input") return dropdown.menu;
  const surface = menus.length === 1 ? menus[0] : undefined;
  if (!surface || !visible(surface)) return undefined;
  const live = classifySurface(surface, dropdown.trigger as HTMLInputElement);
  if (live?.kind !== "list") return undefined;
  if (dropdown.menu.isConnected && live.menu !== dropdown.menu)
    return undefined;
  return live.menu;
}

export function revalidateDropdownFor(
  dropdown: ButtonDropdown,
  menus: readonly HTMLElement[],
): ButtonDropdown["options"] | undefined {
  if (dropdown.surface !== "input") return revalidateDropdown(dropdown, menus);
  const menu = liveDropdownMenu(dropdown, menus);
  if (!menu || !dropdownIsCurrent(dropdown)) return undefined;
  const options = listOptions(menu);
  return options?.length === dropdown.options.length &&
    options.every(
      (option, index) => option.text === dropdown.options[index]?.text,
    )
    ? options
    : undefined;
}
