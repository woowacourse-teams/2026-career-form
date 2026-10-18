import { runStagedAddress } from "./staged-address";
import { stagedAddressPolicy } from "./staged-address-dom";
import { nativeRepeatableProfileCount } from "./native-form-row-assignment";
import {
  executeCommittedSearch,
  committedSearchMatches,
} from "./committed-search";
import {
  currentNativeOwner,
  nativeForm,
  rawNativeName,
} from "./native-form-collection";
import { nativeWriteAdapter, settleNativeDriver } from "./native-form-write";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { MatchedFieldAnalysis } from "../api/types";
import type { FieldCandidateHandle } from "../dom/types";
import { executionPolicy, searchRule } from "../workflow/execution-policy";
import {
  confirmJqueryAutocomplete,
  isJqueryAutocompleteBridgeReady,
} from "../interaction/jquery-autocomplete-bridge";
import { runKakaoAddress } from "../address/kakao-executor";
import {
  gatesPass,
  matchesBinding,
  named,
  option,
  radioGroup,
  setNative,
  text,
  visible,
} from "./primitives";
import type { FieldRule } from "./types";

function verifiedPriority(
  rule: FieldRule | undefined,
  analysis?: MatchedFieldAnalysis,
): boolean {
  return (
    !!rule?.priority &&
    matchesBinding(rule, analysis) &&
    analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    analysis.interactionStatus === "READY" &&
    analysis.writePlan?.command === "CHECK_RADIO"
  );
}
export async function settlePolicySelection(
  document: Document,
  handle: FieldCandidateHandle,
): Promise<boolean> {
  const rule = executionPolicy(document)?.browserPolicy?.fields.find(
    (r) => r.name === handle.candidate.domName,
  );
  if (!rule?.details?.length) return true;
  const selected = handle.elements.filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.checked,
  );
  if (selected.length !== 1) return false;
  const target = selected[0],
    code = target.value;
  const ready = () => {
    const group = radioGroup(document, rule);
    return (
      !!group &&
      group.length === handle.elements.length &&
      group.every((el) => handle.elements.includes(el)) &&
      target.isConnected &&
      target.checked &&
      target.value === code &&
      rule.details!.every((name) => {
        const controls = named(document, name);
        return code === rule.options?.[rule.positiveLabel ?? ""]
          ? controls.length === 1 && visible(controls[0])
          : controls.every((el) => !visible(el));
      })
    );
  };
  if (ready()) return true;
  const view = document.defaultView;
  if (!view) return false;
  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      view.clearTimeout(timer);
      resolve(ready());
    };
    const observer = new view.MutationObserver(() => {
      if (ready()) finish();
    });
    const timer = view.setTimeout(finish, rule.settleMs ?? 1000);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}
export function policyWorkflowAdapter(document: Document): WorkflowAdapter {
  const config = () => executionPolicy(document)?.browserPolicy;
  const ruleFor = (name: string | undefined) =>
    config()?.fields.find((r) => r.name === name);
  const priority = (
    handle: FieldCandidateHandle,
    analysis?: MatchedFieldAnalysis,
  ) => {
    const rule = ruleFor(handle.candidate.domName);
    if (
      !rule ||
      !verifiedPriority(rule, analysis) ||
      handle.candidate.control !== "radio"
    )
      return false;
    const group = radioGroup(document, rule);
    return (
      !!group &&
      group.length === handle.elements.length &&
      group.every((el) => handle.elements.includes(el) && visible(el))
    );
  };
  return {
    async executeStateDriver(
      _doc,
      handle,
      item,
      signal,
      _report,
      beforeMutation,
    ) {
      if (handle.owner !== "native") return undefined;
      if (
        signal.aborted ||
        (beforeMutation && !(await beforeMutation())) ||
        signal.aborted
      )
        return false;
      if (currentNativeOwner(handle)?.field.search)
        return executeCommittedSearch(handle, item, signal, beforeMutation);
      const result = nativeWriteAdapter.tryWrite(handle, item);
      return result.handled && result.written;
    },
    prefersProfileValue: priority,
    normalizeProfileValue(key, value) {
      const normalized = text(value);
      return (
        config()?.normalizations.find((r) => r.keys.includes(key))?.values[
          normalized
        ] ?? value
      );
    },
    canSelectProfileOption(handle, value, key) {
      const rule = ruleFor(handle.candidate.domName),
        el = handle.element;
      if (!rule) return undefined;
      if (key !== undefined && key !== rule.key) return false;
      if (rule.kind === "radio") {
        const reveal = config()?.reveals.find((r) => r.domName === rule.name);
        const label = reveal?.values[text(value)];
        const group = radioGroup(document, rule);
        return (
          el instanceof HTMLInputElement &&
          !!group?.includes(el) &&
          !!label &&
          el.value === rule.options?.[label] &&
          text(el.labels?.[0]?.textContent) === label &&
          visible(el) &&
          (!!rule.overwrite || !group.some((r) => r !== el && r.checked))
        );
      }
      if (rule.kind !== "select") return undefined;
      if (
        !(el instanceof HTMLSelectElement) ||
        named(document, rule.name).length !== 1 ||
        !gatesPass(document, rule, config()!.fields)
      )
        return false;
      const target = option(el, value, rule);
      return (
        !!target &&
        (rule.overwrite === true ||
          el.value === "" ||
          el.selectedOptions[0] === target)
      );
    },
    canWriteProfileOption(handle, item) {
      const rule = ruleFor(handle.candidate.domName),
        el = handle.elements[0];
      if (!rule) return undefined;
      if (rule.priority)
        return (
          priority(handle, item.analysis) &&
          !!rule.options?.[item.profileValue ?? ""] &&
          !handle.elements.some(
            (e) =>
              e instanceof HTMLInputElement &&
              e.value === rule.options?.[item.profileValue ?? ""] &&
              e.checked,
          )
        );
      if (!rule.reviewWritable) return undefined;
      if (
        !item.selected ||
        item.disabled ||
        !matchesBinding(rule, item.analysis) ||
        handle.elements.length !== 1 ||
        !(el instanceof HTMLSelectElement) ||
        !gatesPass(document, rule, config()!.fields)
      )
        return false;
      const target = option(el, item.profileValue ?? "", rule);
      return !!target && el.selectedOptions[0] !== target;
    },
    runAddress: (options) =>
      stagedAddressPolicy(document)
        ? runStagedAddress(options)
        : runKakaoAddress(options),
    get addressFieldNames() {
      return stagedAddressPolicy(document)?.fields.map((f) => f.name);
    },
    get diagnosticsTitle() {
      return config()?.diagnosticsTitle;
    },
    repeatableProfileCount: (id, profile) =>
      nativeRepeatableProfileCount(document, id, profile),
    repeatedProfileSectionHint: (id) =>
      id
        ? (() => {
            const section = nativeForm(document)?.sections.find(
              (s) => s.action?.id === id,
            );
            return section?.action
              ? {
                  categoryId: section.action.categoryId,
                  sectionId: section.action.profileSectionId,
                }
              : config()?.repeatHints[id];
          })()
        : undefined,
    educationSectionHint: (label) =>
      Object.entries(config()?.educationHints ?? {}).find(([part]) =>
        label.toLowerCase().includes(part),
      )?.[1],
    hasFreshRows: (items) =>
      items.some(
        (item) =>
          item.plan.command === "ADD_REPEATABLE_GROUP" &&
          config()?.freshRowFields.some(
            (name) =>
              item.plan.command === "ADD_REPEATABLE_GROUP" &&
              item.plan.expectedFieldNames?.includes(name),
          ) &&
          item.currentGroupCount === 0 &&
          (item.requiredAdditions ?? 0) > 0,
      ),
    isFreshRowDefault: (name) =>
      !!name && !!config()?.freshDefaults.includes(name),
    isStateDriver: (item, name) =>
      !!nativeForm(document)?.sections.some(
        (s) =>
          s.enabled &&
          s.fields.some(
            (f) =>
              f.name === name &&
              f.driver &&
              JSON.stringify(f.binding) ===
                JSON.stringify(item.analysis?.valueBinding),
          ),
      ) ||
      (item.analysis?.writePlan?.command === "SELECT_OPTION" &&
        !!config()?.stateDrivers.some(
          (r) =>
            r.name === name &&
            item.analysis?.valueBinding?.profileFieldKey === r.key &&
            item.analysis?.valueBinding?.type === r.binding,
        )),
    stateDriverStage(item, handle) {
      if (!item.selected || item.disabled) return;
      if (handle.owner === "native")
        return currentNativeOwner(handle)?.field.driver?.stage;
      const rule = ruleFor(handle.candidate.domName);
      if (verifiedPriority(rule, item.analysis))
        return rule?.stage ?? undefined;
      if (
        item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
        item.analysis.interactionStatus !== "READY"
      )
        return;
      const driver = config()?.stateDrivers.find(
        (r) =>
          r.name === handle.candidate.domName &&
          r.key === item.analysis?.valueBinding?.profileFieldKey &&
          r.binding === item.analysis?.valueBinding?.type,
      );
      if (driver && item.analysis.writePlan?.command === "SELECT_OPTION")
        return driver.stage;
      const search = searchRule(document, handle.candidate.domName);
      if (
        !search ||
        item.analysis.writePlan?.command !== "SET_TEXT" ||
        item.analysis.valueBinding?.type !== "DIRECT" ||
        item.analysis.valueBinding.profileFieldKey !== search.profileFieldKey
      )
        return;
      return (
        (config()?.searchStageBase ?? 0) +
        (handle.itemIndex ?? 0) * (config()?.searchRowStride ?? 1) +
        search.stageOffset
      );
    },
    waitForStateDriverReady: (doc, handle, _failure, context) =>
      searchRule(doc, handle.candidate.domName)
        ? isJqueryAutocompleteBridgeReady(doc, handle, context)
        : Promise.resolve(true),
    settleStateDriver: async (doc, handle, failure, context) =>
      handle.owner === "native"
        ? !!context &&
          (!context.beforeMutation || (await context.beforeMutation())) &&
          (currentNativeOwner(handle)?.field.search
            ? committedSearchMatches(handle, context.item)
            : await settleNativeDriver(handle, context.item, context.signal)) &&
          (!context.beforeMutation || (await context.beforeMutation()))
        : ruleFor(handle.candidate.domName)?.priority
          ? settlePolicySelection(doc, handle)
          : searchRule(doc, handle.candidate.domName)
            ? confirmJqueryAutocomplete(doc, handle, failure, context)
            : Promise.resolve(true),
    stateDriverFailureTargets(item, handle) {
      if (handle.owner === "native") {
        const o = currentNativeOwner(handle);
        return o
          ? [
              ...handle.elements,
              ...(o.field.driver?.dependencies ?? []).flatMap((n) => {
                const f = o.section.fields.find((f) => f.name === n)!;
                return Array.from(
                  o.row.querySelectorAll(
                    `[name="${CSS.escape(rawNativeName(f.rawName, o.index))}"]`,
                  ),
                );
              }),
            ]
          : [];
      }
      const name = handle.candidate.domName;
      const dependencies = name
        ? config()?.failureDependencies?.[name]
        : undefined;
      if (!dependencies) return undefined;
      const rule = executionPolicy(document)?.failureScopes.find(
        (r) =>
          r.fieldName === name &&
          r.profileFieldKey === item.analysis?.valueBinding?.profileFieldKey,
      );
      const row = rule && handle.elements[0]?.closest(rule.rowSelector);
      if (!row) return [...handle.elements];
      return [
        ...new Set([
          ...handle.elements,
          ...dependencies.flatMap((field) =>
            Array.from(row.querySelectorAll(`[name="${CSS.escape(field)}"]`)),
          ),
        ]),
      ];
    },
    stateDriverFailureGroup(item, handle) {
      if (handle.owner === "native") return currentNativeOwner(handle)?.row;
      const input = handle.elements[0];
      if (
        !input?.isConnected ||
        item.analysis?.mappingStatus !== "ADAPTER_VERIFIED"
      )
        return;
      const rule = executionPolicy(document)?.failureScopes.find(
        (r) =>
          r.fieldName === handle.candidate.domName &&
          r.profileFieldKey === item.analysis?.valueBinding?.profileFieldKey,
      );
      if (!rule) return;
      const group = input.closest(rule.rowSelector);
      return group?.querySelectorAll(`[name="${CSS.escape(rule.fieldName)}"]`)
        .length === 1
        ? group
        : undefined;
    },
    get revealSelections() {
      return config()?.reveals ?? [];
    },
    selectReveal(doc, selection, value) {
      if (value === undefined) return { code: "PROFILE_UNAVAILABLE", count: 1 };
      const rule = ruleFor(selection.domName);
      if (rule?.key && rule.key !== selection.profileFieldKey)
        return { code: "PROFILE_NOT_SELECTED", count: 1 };
      if (rule?.kind === "select") {
        const el = named(doc, rule.name);
        const target =
          el.length === 1 && el[0] instanceof HTMLSelectElement
            ? option(el[0], text(value), rule)
            : undefined;
        if (
          !target ||
          !(el[0] instanceof HTMLSelectElement) ||
          !gatesPass(doc, rule, config()!.fields)
        )
          return { code: "SELECTION_FAILED", count: 1 };
        if (
          !rule.overwrite &&
          el[0].value !== "" &&
          el[0].selectedOptions[0] !== target
        )
          return { code: "SKIPPED", count: 1 };
        if (el[0].selectedOptions[0] !== target) setNative(el[0], target.value);
        return {
          code:
            el[0].selectedOptions[0] === target
              ? "SELECTED"
              : "SELECTION_FAILED",
          count: 1,
        };
      }
      const reveal = config()?.reveals.find(
        (r) =>
          r.domName === selection.domName &&
          r.profileFieldKey === selection.profileFieldKey,
      );
      const label = reveal?.values[text(value)];
      if (!reveal || !label) return { code: "PROFILE_NOT_SELECTED", count: 1 };
      const group =
        rule?.kind === "radio"
          ? radioGroup(doc, rule)
          : Array.from(
              doc.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
            ).filter(
              (el) =>
                el.name === reveal.domName ||
                (!!reveal.nameSuffixPattern &&
                  el.name.startsWith(reveal.domName) &&
                  new RegExp(reveal.nameSuffixPattern).test(
                    el.name.slice(reveal.domName.length),
                  )),
            );
      const targets = group?.filter(
        (el) =>
          text(el.labels?.[0]?.textContent) === label &&
          (!rule?.options || el.value === rule.options[label]),
      );
      const target = rule
        ? targets?.length === 1
          ? targets[0]
          : undefined
        : targets?.[0];
      if (!group || !target || !visible(target))
        return { code: "TARGET_MISSING", count: 1 };
      if (
        rule &&
        !rule.overwrite &&
        !target.checked &&
        group.some((el) => el.checked)
      )
        return { code: "SKIPPED", count: 1 };
      if (!target.checked) target.click();
      const after = rule ? radioGroup(doc, rule) : group;
      return {
        code:
          target.checked &&
          visible(target) &&
          !!after?.includes(target) &&
          after.every((el) => group.includes(el))
            ? "SELECTED"
            : "SELECTION_FAILED",
        count: 1,
      };
    },
    revealedBindings: (plans) =>
      new Map(
        plans.flatMap((plan) =>
          plan.command === "SELECT_OPTION_TO_REVEAL"
            ? Object.entries(plan.revealedFieldBindings ?? {})
            : [],
        ),
      ),
    revealedProfileFieldKey: (field, name, bindings) => {
      const key = name ? bindings.get(name) : undefined;
      return key &&
        field.valueBinding?.profileFieldKey === key &&
        field.writePlan?.command === "SET_TEXT"
        ? key
        : undefined;
    },
  };
}
