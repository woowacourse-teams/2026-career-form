import { componentWriteRecipe, recipeBindingMatches } from "./write-recipe";
import { componentCapability } from "../component-policy";
import { runDomPlan } from "../action-plan";
import { componentRules, componentName } from "../runtime-rules";
import { componentSelector } from "../component-dom";
import {
  componentPolicy,
  componentPattern,
} from "../../policy/component-policy";
import {
  control,
  currentTrigger,
  mayMutate,
  waitFor,
} from "./workflow-controls";
import { search } from "./workflow-search";
import { componentAddressNames, runComponentAddress } from "./address";
import {
  educationMajorAdd,
  graduateMajorProfileCount,
} from "./workflow-major-count";
import { ownedPopup } from "./workflow-popup";
import type { WorkflowAdapter } from "../../adapters/workflow";
import {
  componentCollectionAdapter,
  componentFieldElements,
  componentMajorRowsForAction,
  componentRadioGroupDomName,
  componentSyntheticDomName,
} from "./collection";
import { customFieldValue } from "../../dom/custom-field-value";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { FailureReporter } from "../../write/failure";
import {
  componentApproved,
  componentEmploymentWrite,
  componentRadioWrite,
  componentText,
  componentUsable,
} from "./write";

async function selectButton(
  trigger: HTMLElement,
  item: ReviewPlanItem,
  signal: AbortSignal,
  handle: FieldCandidateHandle,
  beforeMutation?: () => Promise<boolean>,
  report?: FailureReporter,
): Promise<boolean> {
  if (!trigger.matches("button[aria-controls]")) return false;
  const defaultValue = item.verifiedFreshDefaultValue;
  const freshDefault =
    !!defaultValue &&
    item.currentValue === defaultValue &&
    (componentPolicy(trigger.ownerDocument).freshDefaults ?? []).some(
      (rule) =>
        rule.value === defaultValue &&
        new RegExp(rule.pattern).test(trigger.getAttribute("name") ?? ""),
    );
  const canReplace = (value: string) =>
    value.length === 0 || (freshDefault && value === defaultValue);
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
  const liveValue = () => customFieldValue(handle) ?? componentText(trigger);
  const committedValue = () => {
    if (current() && liveValue() === item.profileValue) return true;
    const name = trigger.getAttribute("name");
    if (!name || signal.aborted) return false;
    const matches = componentFieldElements(trigger.ownerDocument).filter(
      (element) => element.getAttribute("name") === name,
    );
    return (
      matches.length === 1 &&
      matches[0].matches("button[aria-controls]") &&
      componentUsable(matches[0]) &&
      componentText(matches[0]) === item.profileValue
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
  const popup = await waitFor(
    () => ownedPopup(trigger),
    signal,
    trigger.ownerDocument,
  );
  try {
    if (
      !current() ||
      !canReplace(liveValue()) ||
      !popup?.matches(componentSelector(popup, "choicePopup")) ||
      ownedPopup(trigger) !== popup
    )
      return false;
    const options = [
      ...popup.querySelectorAll<HTMLElement>('[role="option"]'),
    ].filter(
      (option) =>
        componentUsable(option) && componentText(option) === item.profileValue,
    );
    if (options.length !== 1 || !current() || !canReplace(liveValue())) {
      if (options.length === 0 && current() && canReplace(liveValue()))
        report?.("OPTION_UNMATCHED");
      return false;
    }
    if (
      !(await mayMutate(signal, beforeMutation)) ||
      !current() ||
      !canReplace(liveValue()) ||
      ownedPopup(trigger) !== popup ||
      !componentUsable(options[0])
    )
      return false;
    options[0].click();
    return !!(await waitFor(
      () => (committedValue() ? true : undefined),
      signal,
      trigger.ownerDocument,
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
  if (!componentCapability(trigger.ownerDocument, "calendar")) return false;
  const source = item.profileValue!;
  const dateRule = componentPolicy(trigger.ownerDocument).dateRules.find(
    (rule) => new RegExp(rule.pattern).test(trigger.getAttribute("name") ?? ""),
  );
  if (!dateRule) return false;
  let monthOnly = dateRule.precision === "month";
  const validFullDate =
    /^\d{4}-\d{2}-\d{2}$/.test(source) &&
    Number.isFinite(Date.parse(`${source}T00:00:00Z`)) &&
    new Date(`${source}T00:00:00Z`).toISOString().slice(0, 10) === source;
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(source);
  if (
    (!validFullDate && !(monthOnly && validMonth)) ||
    (!monthOnly &&
      !componentPolicy(
        trigger.ownerDocument,
      ).structure.dayDateFieldNames.includes(
        trigger.getAttribute("name") ?? "",
      )) ||
    !trigger.matches(componentSelector(trigger, "calendarTrigger"))
  )
    return false;
  let value = monthOnly ? source.slice(0, 7) : source;
  if (
    item.currentValue &&
    item.currentValue.replace(/[^0-9]/g, "") !== value.replaceAll("-", "")
  )
    return false;
  const popupId = trigger.getAttribute("aria-controls");
  const current = () =>
    currentTrigger(handle, item, trigger, signal) &&
    trigger.getAttribute("aria-controls") === popupId;
  const liveValue = () => customFieldValue(handle) ?? componentText(trigger);
  const confirmed = () =>
    current() &&
    liveValue().replace(/[^0-9]/g, "") === value.replaceAll("-", "");
  if (!current()) return false;
  if (confirmed()) return true;
  if (liveValue()) return false;
  if (!(await mayMutate(signal, beforeMutation)) || !current() || liveValue())
    return false;
  trigger.click();
  const popup = await waitFor(
    () => ownedPopup(trigger),
    signal,
    trigger.ownerDocument,
  );
  try {
    if (
      !current() ||
      liveValue() ||
      ownedPopup(trigger) !== popup ||
      !popup?.matches(componentSelector(popup, "calendarPopup"))
    )
      return false;
    const inputs = popup.querySelectorAll<HTMLInputElement>(
      componentSelector(popup, "calendarInput"),
    );
    if (
      inputs.length !== 1 ||
      !componentUsable(inputs[0]) ||
      inputs[0].readOnly
    )
      return false;
    const views = new Set(
      [
        ...popup.querySelectorAll<HTMLElement>(
          componentSelector(popup, "calendarCells"),
        ),
      ]
        .filter(componentUsable)
        .map((cell) =>
          cell.getAttribute(
            componentPolicy(cell.ownerDocument).widget.calendarViewAttribute,
          ),
        ),
    );
    if (
      monthOnly &&
      views.size === 1 &&
      views.has(componentPolicy(trigger.ownerDocument).widget.dayView)
    ) {
      if (
        !componentRules(trigger.ownerDocument).calendar.allowDayFallback ||
        !validFullDate
      )
        return false;
      monthOnly = false;
      value = source;
    }
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
      !componentUsable(input) ||
      input.readOnly
    )
      return false;
    const formatted = value.replaceAll(
      "-",
      monthOnly
        ? componentPolicy(trigger.ownerDocument).widget.monthSeparator
        : componentPolicy(trigger.ownerDocument).widget.daySeparator,
    );
    if (
      !runDomPlan(
        componentPolicy(trigger.ownerDocument).actionPlans.calendarWrite,
        { input },
        { value: formatted },
        current,
      )
    )
      return false;
    const cell = await waitFor<HTMLElement | true>(
      () => {
        if (confirmed()) return true;
        const matches = [
          ...popup.querySelectorAll<HTMLElement>(
            componentSelector(trigger, "calendarValue", [
              monthOnly
                ? componentPolicy(trigger.ownerDocument).widget.monthView
                : componentPolicy(trigger.ownerDocument).widget.dayView,
            ]),
          ),
        ].filter(
          (node) =>
            componentUsable(node) &&
            (monthOnly
              ? node.getAttribute(
                  componentPolicy(node.ownerDocument).widget
                    .optionCodeAttribute,
                ) === String(Number(value.slice(5))) &&
                node.getAttribute("aria-label") ===
                  componentPolicy(trigger.ownerDocument)
                    .widget.monthLabelTemplate.replace(
                      "{year}",
                      String(Number(value.slice(0, 4))),
                    )
                    .replace("{month}", String(Number(value.slice(5))))
              : node.getAttribute(
                  componentPolicy(node.ownerDocument).widget
                    .optionCodeAttribute,
                ) === value),
        );
        return matches.length === 1 ? matches[0] : undefined;
      },
      signal,
      trigger.ownerDocument,
    );
    if (confirmed()) return true;
    if (!cell || !current()) return false;
    if (cell === true) return true;
    if (liveValue() || ownedPopup(trigger) !== popup || !componentUsable(cell))
      return false;
    if (!(await mayMutate(signal, beforeMutation))) return false;
    if (confirmed()) return true;
    if (
      !current() ||
      liveValue() ||
      ownedPopup(trigger) !== popup ||
      !componentUsable(cell)
    )
      return false;
    cell.click();
    return !!(await waitFor(
      () => (confirmed() ? true : undefined),
      signal,
      trigger.ownerDocument,
    ));
  } finally {
    if (
      (await mayMutate(signal, beforeMutation)) &&
      current() &&
      trigger.getAttribute(
        componentPolicy(trigger.ownerDocument).widget.stateAttribute,
      ) === componentPolicy(trigger.ownerDocument).widget.openState
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
      componentSelector(document, "radioGroup"),
    ),
  ].filter((group) => componentRadioGroupDomName(group) === name);
  if (groups.length !== 1 || !componentUsable(groups[0])) return false;
  const selected = [
    ...groups[0].querySelectorAll<HTMLElement>(
      componentSelector(groups[0], "radioOption"),
    ),
  ].filter((radio) => radio.getAttribute("aria-checked") === "true");
  return (
    selected.length === 1 &&
    componentUsable(selected[0]) &&
    componentText(selected[0]) === value
  );
}
export function isComponentRecipeStateDriver(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): boolean {
  const recipe = componentWriteRecipe(handle, item);
  const input = handle.elements[0];
  return (
    !!recipe &&
    recipeBindingMatches(handle, item, recipe) &&
    componentApproved(handle, item) &&
    input instanceof HTMLInputElement &&
    componentSyntheticDomName(input) === recipe.name &&
    componentUsable(input) &&
    !input.readOnly
  );
}
// Compatibility alias; production routing uses configured write recipes.
export const isComponentEmailStateDriver = isComponentRecipeStateDriver;

export function componentWorkflowAdapter(document: Document): WorkflowAdapter {
  const policy = componentPolicy(document);
  return {
    followUpRepeatableAction: (actionDomId) =>
      componentCapability(document, "nestedRepeat") &&
      educationMajorAdd(document).test(actionDomId ?? ""),
    freshDefaultAfterAdd: (handle) => {
      if (!componentCapability(document, "nestedRepeat")) return undefined;
      const action = handle.element;
      const match = educationMajorAdd(document).exec(
        handle.candidate.domId ?? "",
      );
      if (
        !match ||
        !(action instanceof HTMLElement) ||
        componentCollectionAdapter.actionDomId(action) !==
          handle.candidate.domId ||
        !policy.major.freshCounts.includes(
          componentMajorRowsForAction(action)?.length ?? 0,
        )
      )
        return undefined;
      const row = action.closest(componentSelector(action, "row"));
      const rows = componentMajorRowsForAction(action)!;
      const selectedRow =
        componentRules(document).major.newRowPosition === "LAST"
          ? rows.at(-1)
          : rows[0];
      if (!selectedRow) return undefined;
      const name = componentName(
        document,
        selectedRow.name,
        policy.major.classificationSuffix,
      );
      const buttons = row?.querySelectorAll<HTMLButtonElement>(
        `${componentRules(document).major.classificationSelector}[name="${name}"]`,
      );
      const button = buttons?.length === 1 ? buttons[0] : undefined;
      return button &&
        componentUsable(button) &&
        policy.freshDefaults.some(
          (rule) =>
            new RegExp(rule.pattern).test(name) &&
            componentText(button) === rule.value,
        )
        ? button
        : undefined;
    },
    repeatableProfileCount: (action, profile) =>
      graduateMajorProfileCount(action, profile, document),
    hasFreshRows: (items) =>
      items.some((item) => (item.requiredAdditions ?? 0) > 0),
    isFreshRowDefault: () => false,
    isStateDriver: (item, name) =>
      !!name &&
      new RegExp(policy.driverPattern).test(name) &&
      policy.driverCommands.includes(item.analysis?.writePlan?.command ?? ""),
    stateDriverStage: (item, handle) => {
      if (isComponentRecipeStateDriver(item, handle))
        return componentWriteRecipe(handle, item)!.stage;
      const name = handle.candidate.domName;
      if (!name || !componentApproved(handle, item)) return undefined;
      return policy.stages.find(
        (rule) =>
          rule.commands.includes(item.analysis?.writePlan?.command ?? "") &&
          new RegExp(rule.pattern).test(name),
      )?.stage;
    },
    async executeStateDriver(
      document,
      handle,
      item,
      signal,
      report,
      beforeMutation,
    ) {
      if (!componentApproved(handle, item) || signal.aborted) return false;
      const element = control(handle);
      if (
        !element ||
        element.ownerDocument !== document ||
        !componentUsable(element)
      )
        return false;
      const command = item.analysis?.writePlan?.command;
      if (command === "CHECK_CHECKBOX") {
        if (!(await mayMutate(signal, beforeMutation))) return false;
        return componentEmploymentWrite(handle, item);
      }
      if (command === "CHECK_RADIO") {
        if (
          !(await mayMutate(signal, beforeMutation)) ||
          !componentUsable(element)
        )
          return false;
        let clicked = false;
        const written = componentRadioWrite(handle, item, () => {
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
          document,
        ));
      }
      if (command === "SELECT_BUTTON_OPTION")
        return selectButton(
          element,
          item,
          signal,
          handle,
          beforeMutation,
          report,
        );
      if (command === "SELECT_DATE") {
        const liveDate = () =>
          (customFieldValue(handle) ?? componentText(element)).replace(
            /[^0-9]/g,
            "",
          );
        const wasEmpty = !liveDate();
        const written = await selectDate(
          element,
          item,
          signal,
          handle,
          beforeMutation,
        );
        if (written) return true;
        const committed = liveDate();
        // An unparsed calendar input commits the focused day; never leave it.
        if (
          componentRules(document).calendar.clearMismatchedNewValue &&
          wasEmpty &&
          committed &&
          !item.profileValue!.replace(/[^0-9]/g, "").startsWith(committed)
        ) {
          const clears = [
            ...(element
              .closest(componentSelector(element, "calendarRoot"))
              ?.querySelectorAll<HTMLElement>(
                componentSelector(element, "calendarClear"),
              ) ?? []),
          ].filter(componentUsable);
          if (
            clears.length ===
              componentRules(document).calendar.clearControlCount &&
            (await mayMutate(signal, beforeMutation))
          )
            runDomPlan(
              componentPolicy(document).actionPlans.calendarClear,
              { control: clears[0] },
              {},
              () => !signal.aborted && clears[0].isConnected,
            );
          const cleared = await waitFor(
            () => (liveDate() ? undefined : true),
            signal,
            document,
          );
          report?.(cleared ? "DATE_UNCONFIRMED" : "DATE_ROLLBACK_FAILED");
          return false;
        }
        report?.("DATE_UNCONFIRMED");
        return false;
      }
      if (command === "SEARCH_SELECTION") {
        let reported = false;
        const written = await search(
          element,
          item,
          signal,
          handle,
          beforeMutation,
          (code) => {
            reported = true;
            report?.(code);
          },
        );
        if (!written && !reported) report?.("SEARCH_UNCONFIRMED");
        return written;
      }
      return undefined;
    },
    // Dates, searches and language levels reveal nothing, so a failure defers only its own field.
    stateDriverFailureGroup: (item, handle) => {
      const command = item.analysis?.writePlan?.command;
      const name = handle.candidate.domName;
      const languageLevel =
        command === "SELECT_BUTTON_OPTION" &&
        !!name &&
        new RegExp(policy.failurePattern).test(name);
      if (!policy.failureCommands.includes(command ?? "") && !languageLevel)
        return undefined;
      const field = control(handle)?.closest<HTMLElement>(
        policy.failureScope.selector,
      );
      return field?.isConnected &&
        field.querySelectorAll(policy.failureScope.memberSelector).length ===
          policy.failureScope.memberCount
        ? field
        : undefined;
    },
    runAddress: runComponentAddress,
    addressFieldNames: componentAddressNames(document),
    addressRequiresSearch: true,
    repeatedProfileSectionHint: (action) =>
      action ? policy.profileSections[action] : undefined,
    educationSectionHint: (label) => {
      const section = Object.entries(policy.profileSections).find(
        ([action, hint]) =>
          label.includes(action) && hint.categoryId === "education",
      )?.[1].sectionId;
      return section === "highSchool" ||
        section === "university" ||
        section === "graduateSchool"
        ? section
        : undefined;
    },
    revealSelections: [],
    selectReveal: () => ({ code: "TARGET_MISSING", count: 0 }),
    revealedBindings: () => new Map(),
    revealedProfileFieldKey: () => undefined,
  };
}
