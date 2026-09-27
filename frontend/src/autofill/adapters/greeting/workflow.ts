import type { WorkflowAdapter } from "../workflow";
import {
  greetingCollectionAdapter,
  greetingFieldElements,
  greetingFieldLabel,
  greetingMajorRowsForAction,
  greetingRadioGroupDomName,
  greetingSyntheticDomName,
} from "./collection";
import { customFieldValue } from "../../dom/custom-field-value";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { Profile } from "../../../profile/model";
import {
  greetingApproved,
  greetingRadioWrite,
  greetingText,
  greetingUsable,
} from "./write";

const education =
  /^educationalBackground\.(universities|graduateSchools)\.(0|[1-9]\d*)\./;
const graduateMajorAdd = /^greeting:add:graduateSchools:(0|[1-9]\d*):majors$/;
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
function graduateMajorProfileCount(
  actionDomId: string | undefined,
  profile: Profile,
): number | null | undefined {
  const match = graduateMajorAdd.exec(actionDomId ?? "");
  if (!match) return undefined;
  const index = Number(match[1]);
  if (index > 127) return null;
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
function control(handle: FieldCandidateHandle): HTMLElement | undefined {
  return handle.customElements?.[0] ?? handle.elements[0];
}
function currentTrigger(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  trigger: HTMLElement,
  signal: AbortSignal,
): boolean {
  return (
    !signal.aborted &&
    greetingApproved(handle, item) &&
    control(handle) === trigger &&
    greetingUsable(trigger) &&
    trigger.getAttribute("name") === handle.candidate.domName
  );
}
function ownedPopup(trigger: HTMLElement): HTMLElement | undefined {
  const id = trigger.getAttribute("aria-controls");
  if (!id || /\s/.test(id)) return undefined;
  const matches = [
    ...trigger.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === id);
  return matches.length === 1 && greetingUsable(matches[0])
    ? matches[0]
    : undefined;
}
function retainedSearchPopup(
  input: HTMLInputElement,
):
  | { popup: HTMLElement; usable: (element: HTMLElement) => boolean }
  | undefined {
  const id = input.getAttribute("aria-controls");
  if (!id || /\s/.test(id) || input.getAttribute("aria-expanded") !== "true")
    return undefined;
  const matches = [
    ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
  ].filter((node) => node.id === id);
  if (matches.length !== 1) return undefined;
  const popup = matches[0];
  const root = popup.parentElement;
  const positioner = root?.parentElement;
  if (
    !popup.matches(
      '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
    ) ||
    !root?.matches('[data-scope="scroll-area"][data-part="root"]') ||
    !positioner?.matches('[data-scope="combobox"][data-part="positioner"]')
  )
    return undefined;
  const usable = (element: HTMLElement) => {
    if (
      !element.isConnected ||
      element.matches(':disabled, [aria-disabled="true"]')
    )
      return false;
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.parentElement
    ) {
      if (
        node.hasAttribute("hidden") ||
        node.hasAttribute("inert") ||
        (node.getAttribute("aria-hidden") === "true" && node !== positioner)
      )
        return false;
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (!style || style.display === "none" || style.visibility === "hidden")
        return false;
    }
    return true;
  };
  return usable(popup) ? { popup, usable } : undefined;
}
async function waitFor<T>(
  read: () => T | undefined,
  signal: AbortSignal,
  timeoutMs = 1200,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}
async function mayMutate(
  signal: AbortSignal,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  return (
    !signal.aborted &&
    (!beforeMutation || (await beforeMutation())) &&
    !signal.aborted
  );
}
async function selectButton(
  trigger: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  if (!trigger.matches("button[aria-controls]")) return false;
  const freshDefault =
    item.verifiedFreshDefaultValue === "주전공" &&
    item.currentValue === "주전공" &&
    /^educationalBackground\.graduateSchools\.(0|[1-9]\d*)\.majors\.1\.majorClassification$/.test(
      trigger.getAttribute("name") ?? "",
    );
  const canReplace = (value: string) =>
    value.length === 0 || (freshDefault && value === "주전공");
  if (
    item.currentValue &&
    item.currentValue !== item.profileValue &&
    !freshDefault
  )
    return false;
  const popupId = trigger.getAttribute("aria-controls");
  const current = () =>
    currentTrigger(handle, item, trigger, signal) &&
    trigger.getAttribute("aria-controls") === popupId;
  const liveValue = () => customFieldValue(handle) ?? greetingText(trigger);
  const committedValue = () => {
    if (current() && liveValue() === item.profileValue) return true;
    const name = trigger.getAttribute("name");
    if (!name || signal.aborted) return false;
    const matches = greetingFieldElements(trigger.ownerDocument).filter(
      (element) => element.getAttribute("name") === name,
    );
    return (
      matches.length === 1 &&
      matches[0].matches("button[aria-controls]") &&
      greetingUsable(matches[0]) &&
      greetingText(matches[0]) === item.profileValue
    );
  };
  if (!current()) return false;
  if (liveValue() === item.profileValue) return true;
  if (!canReplace(liveValue())) return false;
  const opened = trigger.getAttribute("aria-expanded") !== "true";
  if (
    !(await mayMutate(signal, beforeMutation)) ||
    !current() ||
    !canReplace(liveValue())
  )
    return false;
  trigger.click();
  const popup = await waitFor(() => ownedPopup(trigger), signal);
  try {
    if (
      !current() ||
      !canReplace(liveValue()) ||
      !popup?.matches(
        '[role="listbox"], [data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
      ) ||
      ownedPopup(trigger) !== popup
    )
      return false;
    const options = [
      ...popup.querySelectorAll<HTMLElement>('[role="option"]'),
    ].filter(
      (option) =>
        greetingUsable(option) && greetingText(option) === item.profileValue,
    );
    if (options.length !== 1 || !current() || !canReplace(liveValue()))
      return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      !canReplace(liveValue()) ||
      ownedPopup(trigger) !== popup ||
      !greetingUsable(options[0])
    )
      return false;
    options[0].click();
    return !!(await waitFor(
      () => (committedValue() ? true : undefined),
      signal,
    ));
  } finally {
    if (
      opened &&
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      trigger.getAttribute("aria-expanded") === "true"
    )
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  }
}
function nationalitySearch(input: HTMLInputElement): boolean {
  return (
    input.name === "basicInformation.nationalityCode" &&
    greetingFieldLabel(input) === "국적" &&
    !input.closest('[data-scope="accordion"][data-part="item"]') &&
    input.ownerDocument.querySelectorAll(
      '[name="basicInformation.nationalityCode"]',
    ).length === 1
  );
}

async function search(
  input: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  if (
    !(input instanceof HTMLInputElement) ||
    input.readOnly ||
    !input.matches(
      '[data-scope="combobox"][data-part="input"][role="combobox"][aria-controls]',
    ) ||
    (!/^educationalBackground\.(universities|graduateSchools)\.\d+\.(schoolName|majors\.\d+)$/.test(
      input.name,
    ) &&
      !nationalitySearch(input))
  )
    return false;
  if (input.value && input.value !== item.profileValue) return false;
  const popupId = input.getAttribute("aria-controls");
  const current = () =>
    currentTrigger(handle, item, input, signal) &&
    !input.readOnly &&
    (input.name !== "basicInformation.nationalityCode" ||
      nationalitySearch(input)) &&
    input.getAttribute("aria-controls") === popupId;
  if (!current()) return false;
  const original = input.value;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  let success = false;
  let attemptedWrite = false;
  try {
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== original
    )
      return false;
    if (original) {
      // Greeting unmounts closed search popups. Reopen the existing selection
      // without issuing another input event or choosing a different result.
      if (!retainedSearchPopup(input)) {
        input.focus();
        if (!current() || input.value !== original) return false;
        input.click();
      }
      if (!current() || input.value !== original) return false;
      const retained = await waitFor(() => {
        if (!current() || input.value !== original) return false;
        const retainedPopup = retainedSearchPopup(input);
        if (!retainedPopup) return undefined;
        const checked = [
          ...retainedPopup.popup.querySelectorAll<HTMLElement>(
            '[data-scope="combobox"][data-part="item"][role="option"][data-state="checked"]',
          ),
        ];
        if (checked.length > 1) return false;
        if (checked.length === 0) return undefined;
        return (
          !!checked[0].getAttribute("data-value") &&
          retainedPopup.usable(checked[0]) &&
          greetingText(checked[0]) === item.profileValue
        );
      }, signal);
      if (
        retained !== true ||
        !(await mayMutate(signal, beforeMutation)) ||
        !current() ||
        input.value !== original
      )
        return false;
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      const closed = await waitFor(() => {
        if (!current() || input.value !== original) return false;
        if (input.getAttribute("aria-expanded") !== "false") return undefined;
        const linked = [
          ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
        ].filter((node) => node.id === popupId);
        return linked.length === 0 ? true : undefined;
      }, signal);
      if (closed !== true) return false;
      input.blur();
      success = current() && input.value === original;
      return success;
    }
    input.focus();
    input.click();
    if (!current() || input.value !== original) return false;
    attemptedWrite = true;
    setter.call(input, item.profileValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      input.ownerDocument.activeElement !== input
    )
      return false;
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    let popup = await waitFor(() => ownedPopup(input), signal, 5000);
    if (
      !current() ||
      input.value !== item.profileValue ||
      !popup?.matches(
        '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
      )
    )
      return false;
    const option = await waitFor(
      () => {
        const livePopup = ownedPopup(input);
        if (
          !livePopup?.matches(
            '[data-scope="scroll-area"][data-part="viewport"][role="presentation"][data-state="open"]',
          )
        )
          return undefined;
        popup = livePopup;
        const options = [
          ...popup.querySelectorAll<HTMLElement>(
            '[data-scope="combobox"][data-part="item"][role="option"][data-value]',
          ),
        ].filter(
          (node) =>
            greetingUsable(node) &&
            !!node.getAttribute("data-value") &&
            greetingText(node) === item.profileValue,
        );
        return options.length === 1
          ? options[0]
          : options.length > 1
            ? null
            : undefined;
      },
      signal,
      5000,
    );
    if (
      !option ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !greetingUsable(option)
    )
      return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      input.value !== item.profileValue ||
      ownedPopup(input) !== popup ||
      !greetingUsable(option)
    )
      return false;
    const selectedId = option.getAttribute("data-value");
    const key = async (value: "ArrowDown" | "Enter") => {
      if (
        !(await mayMutate(signal, beforeMutation)) ||
        !current() ||
        input.value !== item.profileValue
      )
        return false;
      if (value === "Enter") {
        const active = [
          ...(ownedPopup(input)?.querySelectorAll<HTMLElement>(
            '[data-scope="combobox"][data-part="item"][role="option"]',
          ) ?? []),
        ].filter(
          (node) => node.id === input.getAttribute("aria-activedescendant"),
        );
        if (
          active.length !== 1 ||
          active[0].id !== option.id ||
          active[0].getAttribute("data-value") !== selectedId ||
          greetingText(active[0]) !== item.profileValue ||
          !greetingUsable(active[0])
        )
          return false;
      }
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: value,
          code: value,
          bubbles: true,
        }),
      );
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: value, code: value, bubbles: true }),
      );
      return true;
    };
    if (option.id) {
      const count = popup.querySelectorAll(
        '[data-scope="combobox"][data-part="item"][role="option"]',
      ).length;
      const navigationLimit = nationalitySearch(input) ? 256 : 128;
      for (
        let step = 0;
        input.getAttribute("aria-activedescendant") !== option.id &&
        step < Math.min(count + 1, navigationLimit);
        step++
      ) {
        const previous = input.getAttribute("aria-activedescendant");
        if (!(await key("ArrowDown"))) return false;
        const changed = await waitFor(
          () => {
            const active = input.getAttribute("aria-activedescendant");
            return active && active !== previous ? true : undefined;
          },
          signal,
          250,
        );
        if (!changed) return false;
      }
      if (!(await key("Enter"))) return false;
    } else {
      option.click();
    }
    const selected = () => {
      if (!current() || input.value !== item.profileValue) return undefined;
      const popups = [
        ...input.ownerDocument.querySelectorAll<HTMLElement>("[id]"),
      ].filter(
        (node) =>
          node.id === popupId &&
          node.matches(
            '[data-scope="scroll-area"][data-part="viewport"][role="presentation"]',
          ),
      );
      if (popups.length !== 1) return undefined;
      const checked = [
        ...popups[0].querySelectorAll<HTMLElement>(
          '[data-scope="combobox"][data-part="item"][role="option"][data-state="checked"]',
        ),
      ];
      return checked.length === 1 &&
        checked[0].getAttribute("data-value") === selectedId &&
        greetingText(checked[0]) === item.profileValue
        ? true
        : undefined;
    };
    success = !!(await waitFor(selected, signal));
    if (
      !success &&
      option.id &&
      current() &&
      input.value === item.profileValue &&
      input.getAttribute("aria-expanded") === "false" &&
      (await key("ArrowDown"))
    ) {
      success = !!(await waitFor(selected, signal, 5000));
    }
    return success;
  } finally {
    if (
      attemptedWrite &&
      !success &&
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      input.value === item.profileValue
    ) {
      setter.call(input, original);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      input.getAttribute("aria-expanded") === "true"
    )
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  }
}
async function selectDate(
  trigger: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const source = item.profileValue!;
  const monthOnly =
    /^educationalBackground\.(universities|graduateSchools)\.\d+\.enrollmentPeriod\.(startDate|endDate)$/.test(
      trigger.getAttribute("name") ?? "",
    ) ||
    /^militaryServicePreferentialEmploymentStatus\.militaryService\.servicePeriod\.(startDate|endDate)$/.test(
      trigger.getAttribute("name") ?? "",
    );
  const validFullDate =
    /^\d{4}-\d{2}-\d{2}$/.test(source) &&
    Number.isFinite(Date.parse(`${source}T00:00:00Z`)) &&
    new Date(`${source}T00:00:00Z`).toISOString().slice(0, 10) === source;
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(source);
  if (
    (!validFullDate && !(monthOnly && validMonth)) ||
    (!monthOnly &&
      trigger.getAttribute("name") !== "basicInformation.birthdate") ||
    !trigger.matches(
      'button[data-scope="date-picker"][data-part="trigger"][aria-controls]',
    )
  )
    return false;
  const value = monthOnly ? source.slice(0, 7) : source;
  if (
    item.currentValue &&
    item.currentValue.replace(/[^0-9]/g, "") !== value.replaceAll("-", "")
  )
    return false;
  const popupId = trigger.getAttribute("aria-controls");
  const current = () =>
    currentTrigger(handle, item, trigger, signal) &&
    trigger.getAttribute("aria-controls") === popupId;
  const liveValue = () => customFieldValue(handle) ?? greetingText(trigger);
  const confirmed = () =>
    current() &&
    liveValue().replace(/[^0-9]/g, "") === value.replaceAll("-", "");
  if (!current()) return false;
  if (confirmed()) return true;
  if (liveValue()) return false;
  if (!(await mayMutate(signal, beforeMutation)) || !current() || liveValue())
    return false;
  trigger.click();
  const popup = await waitFor(() => ownedPopup(trigger), signal);
  try {
    if (
      !current() ||
      liveValue() ||
      ownedPopup(trigger) !== popup ||
      !popup?.matches(
        '[data-scope="date-picker"][data-part="content"][role="application"][aria-label="calendar"]',
      )
    )
      return false;
    const inputs = popup.querySelectorAll<HTMLInputElement>(
      'input[data-scope="date-picker"][data-part="input"]',
    );
    if (inputs.length !== 1 || !greetingUsable(inputs[0]) || inputs[0].readOnly)
      return false;
    const input = inputs[0];
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) return false;
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      liveValue() ||
      ownedPopup(trigger) !== popup ||
      !greetingUsable(input) ||
      input.readOnly
    )
      return false;
    setter.call(input, value.replaceAll("-", monthOnly ? ". " : "."));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    const cell = await waitFor<HTMLElement | true>(() => {
      if (confirmed()) return true;
      const matches = [
        ...popup.querySelectorAll<HTMLElement>(
          `[data-scope="date-picker"][data-part="table-cell-trigger"][data-view="${monthOnly ? "month" : "day"}"][data-value]`,
        ),
      ].filter(
        (node) =>
          greetingUsable(node) &&
          (monthOnly
            ? node.getAttribute("data-value") ===
                String(Number(value.slice(5))) &&
              node.getAttribute("aria-label") ===
                `${Number(value.slice(0, 4))}년 ${Number(value.slice(5))}월`
            : node.getAttribute("data-value") === value),
      );
      return matches.length === 1 ? matches[0] : undefined;
    }, signal);
    if (confirmed()) return true;
    if (!cell || !current()) return false;
    if (cell === true) return true;
    if (liveValue() || ownedPopup(trigger) !== popup || !greetingUsable(cell))
      return false;
    if (!(await mayMutate(signal, beforeMutation))) return false;
    if (confirmed()) return true;
    if (
      !current() ||
      liveValue() ||
      ownedPopup(trigger) !== popup ||
      !greetingUsable(cell)
    )
      return false;
    cell.click();
    return !!(await waitFor(() => (confirmed() ? true : undefined), signal));
  } finally {
    if (
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      trigger.getAttribute("data-state") === "open"
    )
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  }
}
function confirmedRadioSelection(
  document: Document,
  name: string | undefined,
  value: string | undefined,
): boolean {
  if (!name || !value) return false;
  const groups = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-scope="toggle-group"][data-part="root"][role="radiogroup"]',
    ),
  ].filter((group) => greetingRadioGroupDomName(group) === name);
  if (groups.length !== 1 || !greetingUsable(groups[0])) return false;
  const selected = [
    ...groups[0].querySelectorAll<HTMLElement>(
      'button[data-scope="toggle-group"][data-part="item"][role="radio"]',
    ),
  ].filter((radio) => radio.getAttribute("aria-checked") === "true");
  return (
    selected.length === 1 &&
    greetingUsable(selected[0]) &&
    greetingText(selected[0]) === value
  );
}
/** Only the reviewed, current Greeting email may run before conditional controls. */
export function isGreetingEmailStateDriver(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const input = handle.elements[0];
  const binding = item.analysis?.valueBinding;
  return (
    greetingApproved(handle, item) &&
    handle.candidate.domName === "basicInformation.email" &&
    item.analysis?.writePlan?.command === "SET_TEXT" &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === "contact.contact.email" &&
    handle.elements.length === 1 &&
    input instanceof HTMLInputElement &&
    greetingSyntheticDomName(input) === "basicInformation.email" &&
    greetingUsable(input) &&
    !input.readOnly &&
    ["email", "text"].includes(input.type)
  );
}

export const greetingWorkflowAdapter: WorkflowAdapter = {
  followUpRepeatableAction: (actionDomId) =>
    graduateMajorAdd.test(actionDomId ?? ""),
  freshDefaultAfterAdd: (handle) => {
    const action = handle.element;
    const match = graduateMajorAdd.exec(handle.candidate.domId ?? "");
    if (
      !match ||
      !(action instanceof HTMLElement) ||
      greetingCollectionAdapter.actionDomId(action) !==
        handle.candidate.domId ||
      greetingMajorRowsForAction(action)?.length !== 2
    )
      return undefined;
    const row = action.closest('[data-scope="accordion"][data-part="item"]');
    const name = `educationalBackground.graduateSchools.${match[1]}.majors.1.majorClassification`;
    const buttons = row?.querySelectorAll<HTMLButtonElement>(
      `button[name="${name}"]`,
    );
    const button = buttons?.length === 1 ? buttons[0] : undefined;
    return button && greetingUsable(button) && greetingText(button) === "주전공"
      ? button
      : undefined;
  },
  repeatableProfileCount: graduateMajorProfileCount,
  hasFreshRows: (items) =>
    items.some((item) => (item.requiredAdditions ?? 0) > 0),
  isFreshRowDefault: () => false,
  isStateDriver: (item, name) =>
    !!name &&
    (education.test(name) ||
      name.startsWith("militaryServicePreferentialEmploymentStatus.") ||
      name === "basicInformation.birthdate" ||
      name === "basicInformation.nationalityCode") &&
    [
      "SELECT_BUTTON_OPTION",
      "CHECK_RADIO",
      "SEARCH_SELECTION",
      "SELECT_DATE",
    ].includes(item.analysis?.writePlan?.command ?? ""),
  stateDriverStage: (item, handle) => {
    if (isGreetingEmailStateDriver(item, handle)) return 0;
    const name = handle.candidate.domName;
    if (!name || !greetingApproved(handle, item)) return undefined;
    const command = item.analysis?.writePlan?.command;
    if (command === "CHECK_RADIO" || command === "SELECT_BUTTON_OPTION")
      return 1;
    if (command === "SEARCH_SELECTION")
      return name.endsWith(".schoolName") ? 2 : 3;
    if (command === "SELECT_DATE") return 4;
    return undefined;
  },
  async executeStateDriver(
    document,
    handle,
    item,
    signal,
    report,
    beforeMutation,
  ) {
    if (!greetingApproved(handle, item) || signal.aborted) return false;
    const element = control(handle);
    if (
      !element ||
      element.ownerDocument !== document ||
      !greetingUsable(element)
    )
      return false;
    const command = item.analysis?.writePlan?.command;
    if (command === "CHECK_RADIO") {
      if (
        !(await mayMutate(signal, beforeMutation)) ||
        !greetingUsable(element)
      )
        return false;
      let clicked = false;
      const written = greetingRadioWrite(handle, item, () => {
        clicked = true;
      });
      if (written) return true;
      if (!clicked) return false;
      return !!(await waitFor(
        () =>
          confirmedRadioSelection(
            document,
            handle.candidate.domName,
            item.profileValue,
          )
            ? true
            : undefined,
        signal,
      ));
    }
    if (command === "SELECT_BUTTON_OPTION")
      return selectButton(element, item, signal, handle, beforeMutation);
    if (command === "SELECT_DATE")
      return selectDate(element, item, signal, handle, beforeMutation);
    if (command === "SEARCH_SELECTION") {
      const written = await search(
        element,
        item,
        signal,
        handle,
        beforeMutation,
      );
      if (!written) report?.("SEARCH_UNCONFIRMED");
      return written;
    }
    return undefined;
  },
  repeatedProfileSectionHint: (action) =>
    action === "greeting:add:universities"
      ? { categoryId: "education", sectionId: "university" }
      : action === "greeting:add:graduateSchools"
        ? { categoryId: "education", sectionId: "graduateSchool" }
        : undefined,
  educationSectionHint: (label) =>
    label.includes("greeting:add:graduateSchools")
      ? "graduateSchool"
      : label.includes("greeting:add:universities")
        ? "university"
        : undefined,
  revealSelections: [],
  selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
  revealedBindings: () => new Map(),
  revealedProfileFieldKey: () => undefined,
};
