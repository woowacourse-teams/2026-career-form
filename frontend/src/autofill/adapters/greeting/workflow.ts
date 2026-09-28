import {
  control,
  currentTrigger,
  mayMutate,
  waitFor,
} from "./workflow-controls";
import { search } from "./workflow-search";
import {
  educationMajorAdd,
  graduateMajorProfileCount,
} from "./workflow-major-count";
import { ownedPopup } from "./workflow-popup";
import type { WorkflowAdapter } from "../workflow";
import {
  greetingCollectionAdapter,
  greetingFieldElements,
  greetingMajorRowsForAction,
  greetingRadioGroupDomName,
  greetingSyntheticDomName,
} from "./collection";
import { customFieldValue } from "../../dom/custom-field-value";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import {
  greetingApproved,
  greetingEmploymentWrite,
  greetingRadioWrite,
  greetingText,
  greetingUsable,
} from "./write";

const education =
  /^educationalBackground\.(?:(universities|graduateSchools)\.(0|[1-9]\d*)|highSchool)\./;
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
    /^educationalBackground\.(?:graduateSchools|universities)\.(0|[1-9]\d*)\.majors\.[12]\.majorClassification$/.test(
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
async function selectDate(
  trigger: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const source = item.profileValue!;
  const monthOnly =
    /^educationalBackground\.(?:(?:universities|graduateSchools)\.\d+|highSchool)\.enrollmentPeriod\.(startDate|endDate)$/.test(
      trigger.getAttribute("name") ?? "",
    ) ||
    /^militaryServicePreferentialEmploymentStatus\.militaryService\.servicePeriod\.(startDate|endDate)$/.test(
      trigger.getAttribute("name") ?? "",
    ) ||
    /^workHistory\.workExperiences\.\d+\.employmentPeriod\.(startDate|endDate)$/.test(
      trigger.getAttribute("name") ?? "",
    ) ||
    /^languagesCertificationsAndOtherActivity\.(certifiedLanguageTests|certificatesLicenses)\.\d+\.acquisitionDate$/.test(
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
    educationMajorAdd.test(actionDomId ?? ""),
  freshDefaultAfterAdd: (handle) => {
    const action = handle.element;
    const match = educationMajorAdd.exec(handle.candidate.domId ?? "");
    if (
      !match ||
      !(action instanceof HTMLElement) ||
      greetingCollectionAdapter.actionDomId(action) !==
        handle.candidate.domId ||
      ![2, 3].includes(greetingMajorRowsForAction(action)?.length ?? 0)
    )
      return undefined;
    const row = action.closest('[data-scope="accordion"][data-part="item"]');
    const majorIndex = greetingMajorRowsForAction(action)!.length - 1;
    const name = `educationalBackground.${match[1]}.${match[2]}.majors.${majorIndex}.majorClassification`;
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
      name === "basicInformation.gender" ||
      name.startsWith("workHistory.workExperiences.") ||
      name.startsWith("languagesCertificationsAndOtherActivity.") ||
      name === "basicInformation.birthdate" ||
      name === "basicInformation.nationalityCode") &&
    [
      "SELECT_BUTTON_OPTION",
      "CHECK_RADIO",
      "CHECK_CHECKBOX",
      "SEARCH_SELECTION",
      "SELECT_DATE",
    ].includes(item.analysis?.writePlan?.command ?? ""),
  stateDriverStage: (item, handle) => {
    if (isGreetingEmailStateDriver(item, handle)) return 0;
    const name = handle.candidate.domName;
    if (!name || !greetingApproved(handle, item)) return undefined;
    const command = item.analysis?.writePlan?.command;
    if (
      /\.(grade|conversationalProficiency)$/.test(name) &&
      command === "SELECT_BUTTON_OPTION"
    )
      return 3;
    if (
      command === "CHECK_RADIO" ||
      command === "CHECK_CHECKBOX" ||
      command === "SELECT_BUTTON_OPTION"
    )
      return 1;
    if (command === "SEARCH_SELECTION")
      return /\.(schoolName|companyName|testName|credentials)$/.test(name)
        ? 2
        : 3;
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
    if (command === "CHECK_CHECKBOX") {
      if (!(await mayMutate(signal, beforeMutation))) return false;
      return greetingEmploymentWrite(handle, item);
    }
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
        : action === "greeting:add:workExperiences"
          ? { categoryId: "careers", sectionId: "career" }
          : action === "greeting:add:certifiedLanguageTests"
            ? { categoryId: "languages", sectionId: "languageTest" }
            : action === "greeting:add:foreignLanguageProficiencies"
              ? { categoryId: "languages", sectionId: "languageSkill" }
              : action === "greeting:add:certificatesLicenses"
                ? { categoryId: "certifications", sectionId: "certificate" }
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
