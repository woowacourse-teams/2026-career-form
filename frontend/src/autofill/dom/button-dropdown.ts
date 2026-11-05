import { metadata } from "./metadata";

const TRIGGERS =
  "button[aria-haspopup='menu'], button[aria-haspopup='listbox'], button[aria-controls], [role='button'][aria-haspopup='menu'], [role='button'][aria-haspopup='listbox'], .ant-dropdown-trigger";
const MENUS = "[role='menu'], [role='listbox']";

export interface ButtonDropdown {
  readonly trigger: HTMLElement;
  readonly field: HTMLElement;
  readonly scope: HTMLElement;
  readonly scopeId: string;
  readonly menu: HTMLElement;
  readonly initialText: string;
  readonly controls: string | null;
  readonly options: readonly { element: HTMLElement; text: string }[];
}

function fieldScope(trigger: HTMLElement): HTMLElement | undefined {
  const local = trigger.parentElement?.closest<HTMLElement>("[id]");
  if (
    local &&
    local !== trigger.ownerDocument.body &&
    local !== trigger.ownerDocument.documentElement &&
    local.querySelectorAll(TRIGGERS).length === 1
  )
    return local;
  return (
    trigger.closest<HTMLElement>("form, fieldset, section, [role='group']") ??
    undefined
  );
}

function isFieldTrigger(trigger: HTMLElement): boolean {
  const scope = fieldScope(trigger);
  return Boolean(
    scope &&
    !trigger.closest("header, nav, [role='navigation']") &&
    (scope.matches("form, fieldset, section, [role='group']") ||
      (!scope.querySelector("a[href]") &&
        Array.from(scope.querySelectorAll("button")).every(
          (button) => button === trigger,
        ))),
  );
}

function visible(element: HTMLElement): boolean {
  if (
    !element.isConnected ||
    element.closest("[hidden], [aria-hidden='true'], [inert]")
  )
    return false;
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}

function visibleMenus(document: Document): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(MENUS)).filter(
    visible,
  );
}

export function dropdownText(trigger: HTMLElement): string {
  return trigger.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function fieldValues(document: Document): Map<HTMLElement | Text, string> {
  const values = new Map<HTMLElement | Text, string>();
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(
    "input:not([type='password']):not([type='hidden']):not([type='file']), select, textarea",
  ))
    values.set(
      control,
      JSON.stringify([
        control.value,
        control instanceof HTMLInputElement ? control.checked : undefined,
        control instanceof HTMLSelectElement
          ? Array.from(control.selectedOptions, (option) => option.index)
          : undefined,
      ]),
    );
  for (const trigger of document.querySelectorAll<HTMLElement>(TRIGGERS)) {
    if (
      trigger instanceof HTMLInputElement ||
      trigger instanceof HTMLSelectElement ||
      trigger instanceof HTMLTextAreaElement
    )
      continue;
    values.set(trigger, dropdownText(trigger));
    const walker = document.createTreeWalker(trigger, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (node instanceof Text) values.set(node, node.data);
  }
  return values;
}

function valuesUnchanged(
  document: Document,
  before: ReadonlyMap<HTMLElement | Text, string>,
): boolean {
  const after = fieldValues(document);
  return [...before].every(([element, value]) => after.get(element) === value);
}

/** Only rolls back effects of our own probe, never trusted user edits. */
export function captureDropdownProbe(document: Document) {
  const before = fieldValues(document);
  let userEdited = false;
  let programmaticClicks = 0;
  const input = (event: Event) => {
    if (event.type === "click" && !event.isTrusted) {
      programmaticClicks += 1;
      queueMicrotask(() => {
        programmaticClicks -= 1;
      });
    } else if (
      event.isTrusted &&
      (!(event.type === "input" || event.type === "change") ||
        programmaticClicks === 0)
    )
      userEdited = true;
  };
  const events = [
    "input",
    "change",
    "pointerdown",
    "keydown",
    "click",
  ] as const;
  events.forEach((name) => document.addEventListener(name, input, true));
  return {
    unchanged: () => !userEdited && valuesUnchanged(document, before),
    interrupted: () => userEdited,
    release: () =>
      events.forEach((name) => document.removeEventListener(name, input, true)),
    restore: () => {
      if (userEdited) return false;
      for (const [element, serialized] of before) {
        if (!element.isConnected) return false;
        if (element instanceof Text) {
          if (element.data !== serialized) element.data = serialized;
          continue;
        }
        if (!(
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ))
          continue;
        const [value, checked, selected] = JSON.parse(serialized) as [
          string,
          boolean | null,
          number[] | null,
        ];
        let changed = false;
        if (element.value !== value) {
          const prototype =
            element instanceof HTMLInputElement
              ? HTMLInputElement.prototype
              : element instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(
            prototype,
            "value",
          )?.set;
          if (!setter) return false;
          setter.call(element, value);
          changed = true;
        }
        if (
          element instanceof HTMLInputElement &&
          element.checked !== checked
        ) {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "checked",
          )?.set;
          if (!setter) return false;
          setter.call(element, checked);
          changed = true;
        }
        if (element instanceof HTMLSelectElement && selected) {
          Array.from(element.options).forEach((option, index) => {
            if (option.selected !== selected.includes(index)) {
              option.selected = selected.includes(index);
              changed = true;
            }
          });
        }
        if (changed) {
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      return valuesUnchanged(document, before);
    },
  };
}

/** Subscribe before the action, including synchronous and deferred DOM updates. */
function observeEffect<T>(
  document: Document,
  action: () => void,
  read: () => T | undefined,
  signal?: AbortSignal,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | undefined) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const check = () => {
      const value = read();
      if (value !== undefined) finish(value);
    };
    const observer = new MutationObserver(check);
    const abort = () => finish(undefined);
    const timeout = setTimeout(() => finish(undefined), 1000);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      finish(undefined);
      return;
    }
    action();
    check();
  });
}

function explicitMenu(trigger: HTMLElement): HTMLElement | undefined {
  const ids = trigger.getAttribute("aria-controls")?.trim().split(/\s+/) ?? [];
  if (ids.length !== 1) return undefined;
  const matches = Array.from(
    trigger.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ).filter((element) => element.id === ids[0]);
  const menu = matches.length === 1 ? matches[0] : undefined;
  return menu?.matches(MENUS) ? menu : undefined;
}

function anchored(trigger: HTMLElement, menu: HTMLElement): boolean {
  const owner = trigger.getBoundingClientRect();
  const popup = menu.getBoundingClientRect();
  return (
    owner.width > 0 &&
    owner.height > 0 &&
    popup.width > 0 &&
    popup.height > 0 &&
    Math.min(owner.right, popup.right) > Math.max(owner.left, popup.left) &&
    (Math.abs(owner.bottom - popup.top) <= 16 ||
      Math.abs(owner.top - popup.bottom) <= 16)
  );
}

function ownedMenu(trigger: HTMLElement, menu: HTMLElement): boolean {
  if (!visible(trigger) || !visible(menu)) return false;
  const declared = trigger.getAttribute("aria-controls");
  if (declared !== null) return explicitMenu(trigger) === menu;
  const field = trigger.parentElement;
  const region = trigger.closest("form, fieldset, section, [role='group']");
  const menuRegion = menu.closest("form, fieldset, section, [role='group']");
  return Boolean(
    field &&
    field.querySelectorAll(TRIGGERS).length === 1 &&
    !field.querySelector("input, select, textarea") &&
    (!menuRegion || menuRegion === region) &&
    anchored(trigger, menu),
  );
}

function menuOptions(menu: HTMLElement): ButtonDropdown["options"] | undefined {
  if (
    menu.querySelector(
      "input, select, textarea, [contenteditable='true'], a[href], button:not([type='button']), [role='combobox']",
    )
  )
    return undefined;
  const options = Array.from(
    menu.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem']"),
  ).filter((option) => option.closest(MENUS) === menu);
  if (!options.length || options.length > 128) return undefined;
  const texts = options.map((element) => dropdownText(element));
  if (texts.some((text) => !text || text.length > 120)) return undefined;
  return options.map((element, index) => ({
    element,
    text: texts[index] ?? "",
  }));
}

export async function closeDropdown(
  trigger: HTMLElement,
  menus: readonly HTMLElement[],
): Promise<boolean> {
  const closed = () =>
    menus.every((menu) => !visible(menu)) ? true : undefined;
  if (closed()) return true;
  if (!trigger.isConnected) return false;
  return (
    (await observeEffect(
      trigger.ownerDocument,
      () => {
        trigger.click();
        queueMicrotask(() => {
          if (!closed())
            trigger.ownerDocument.body?.dispatchEvent(
              new MouseEvent("mousedown", { bubbles: true }),
            );
        });
      },
      closed,
    )) === true
  );
}

export async function openDropdown(
  trigger: HTMLElement,
  signal?: AbortSignal,
): Promise<HTMLElement[]> {
  if (visibleMenus(trigger.ownerDocument).length > 0 || signal?.aborted)
    return [];
  const observed = await observeEffect(
    trigger.ownerDocument,
    () => trigger.click(),
    () => {
      const menus = visibleMenus(trigger.ownerDocument);
      return menus.length ? menus : undefined;
    },
    signal,
  );
  return [
    ...new Set([...(observed ?? []), ...visibleMenus(trigger.ownerDocument)]),
  ];
}

export function dropdownIsCurrent(dropdown: ButtonDropdown): boolean {
  return (
    dropdown.trigger.isConnected &&
    dropdown.field.isConnected &&
    dropdown.trigger.parentElement === dropdown.field &&
    dropdown.scope.isConnected &&
    dropdown.scope.contains(dropdown.trigger) &&
    dropdown.scope.id === dropdown.scopeId &&
    dropdown.trigger.getAttribute("aria-controls") === dropdown.controls &&
    (dropdown.controls === null ||
      explicitMenu(dropdown.trigger) === dropdown.menu) &&
    visible(dropdown.trigger) &&
    dropdown.trigger.getAttribute("aria-disabled") !== "true" &&
    !(
      dropdown.trigger instanceof HTMLButtonElement && dropdown.trigger.disabled
    )
  );
}

export function dropdownValue(dropdown: ButtonDropdown): string | undefined {
  if (!dropdownIsCurrent(dropdown)) return undefined;
  const text = dropdownText(dropdown.trigger);
  if (dropdown.options.some((option) => option.text === text)) return text;
  const placeholder =
    (dropdown.trigger.hasAttribute("data-placeholder") &&
      dropdown.trigger.getAttribute("data-placeholder") !== "false") ||
    /^(?:선택(?:해\s*주세요\.?)?|select(?: an? option)?|choose(?: an? option)?)$/i.test(
      text,
    );
  return placeholder && text === dropdown.initialText ? "" : text;
}

export async function confirmDropdownSelection(
  dropdown: ButtonDropdown,
  option: HTMLElement,
  value: string,
  current: () => boolean,
  signal?: AbortSignal,
): Promise<boolean> {
  return (
    (await observeEffect(
      dropdown.trigger.ownerDocument,
      () => option.click(),
      () => {
        if (!current()) return false;
        return dropdownValue(dropdown) === value ? true : undefined;
      },
      signal,
    )) === true
  );
}

export function revalidateDropdown(
  dropdown: ButtonDropdown,
  menus: readonly HTMLElement[],
): ButtonDropdown["options"] | undefined {
  const menu = menus.length === 1 ? menus[0] : undefined;
  const liveMenus = visibleMenus(dropdown.trigger.ownerDocument);
  if (
    !menu ||
    menu !== dropdown.menu ||
    !isFieldTrigger(dropdown.trigger) ||
    liveMenus.length !== 1 ||
    liveMenus[0] !== menu ||
    !dropdownIsCurrent(dropdown) ||
    !ownedMenu(dropdown.trigger, menu)
  )
    return undefined;
  const options = menuOptions(menu);
  return options?.length === dropdown.options.length &&
    options.every(
      (option, index) => option.text === dropdown.options[index]?.text,
    )
    ? options
    : undefined;
}

export async function collectButtonDropdowns(
  document: Document,
  signal?: AbortSignal,
): Promise<ReadonlyMap<HTMLElement, ButtonDropdown>> {
  const collected = new Map<HTMLElement, ButtonDropdown>();
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>(TRIGGERS),
  ).filter(
    (trigger) =>
      visible(trigger) &&
      isFieldTrigger(trigger) &&
      trigger.getAttribute("role") !== "combobox" &&
      !(
        trigger instanceof HTMLInputElement ||
        trigger instanceof HTMLSelectElement ||
        trigger instanceof HTMLTextAreaElement
      ) &&
      !(
        trigger instanceof HTMLButtonElement &&
        (trigger.type !== "button" || trigger.disabled)
      ) &&
      trigger.getAttribute("aria-disabled") !== "true" &&
      !/저장|제출|미리보기|검색|조회|다음|이전|save|submit|preview|search|next|previous/i.test(
        metadata(trigger.getAttribute("aria-label")) ?? dropdownText(trigger),
      ) &&
      (trigger.getAttribute("aria-controls") === null || explicitMenu(trigger)),
  );
  for (const trigger of triggers) {
    if (signal?.aborted || visibleMenus(document).length) break;
    const field = trigger.parentElement;
    const scope = fieldScope(trigger);
    if (!field || !scope) continue;
    const probe = captureDropdownProbe(document);
    const initialText = dropdownText(trigger);
    const controls = trigger.getAttribute("aria-controls");
    let menus: HTMLElement[] = [];
    let menu: HTMLElement | undefined;
    let options: ButtonDropdown["options"] | undefined;
    let intact = false;
    let closed = false;
    try {
      menus = await openDropdown(trigger, signal);
      menus = [...new Set([...menus, ...visibleMenus(document)])];
      menu = menus.length === 1 ? menus[0] : undefined;
      intact = probe.unchanged();
      options =
        intact && menu && ownedMenu(trigger, menu)
          ? menuOptions(menu)
          : undefined;
    } finally {
      try {
        closed = await closeDropdown(trigger, menus);
        if (!probe.unchanged()) {
          intact = false;
          if (!probe.interrupted() && !probe.restore())
            throw new Error(
              "드롭다운 옵션 확인 중 변경된 지원서 값을 복구할 수 없습니다.",
            );
        }
        if (!closed)
          throw new Error("드롭다운 옵션 확인 후 목록을 닫을 수 없습니다.");
      } finally {
        probe.release();
      }
    }
    if (!intact || menus.length > 1) {
      collected.clear();
      break;
    }
    if (!menu || !options || signal?.aborted) continue;
    collected.set(trigger, {
      trigger,
      field,
      scope,
      scopeId: scope.id,
      menu,
      initialText,
      controls,
      options,
    });
  }
  return collected;
}
