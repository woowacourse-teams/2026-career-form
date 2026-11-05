import type { CompanyWriteAdapter } from "../adapters/write";
import { executionPolicy } from "../workflow/execution-policy";
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
export const policyWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    const input = handle.elements[0];
    if (!input) return { handled: false };
    const policy = executionPolicy(input.ownerDocument)?.browserPolicy;
    const rule = policy?.fields.find(
      (r) => r.name === handle.candidate.domName,
    );
    if (!rule || !policy) return { handled: false };
    const fail = { handled: true, written: false } as const;
    const success = { handled: true, written: true } as const;
    if (
      rule.kind === "blocked" ||
      !matchesBinding(rule, item.analysis) ||
      !visible(input, rule.kind === "radio" && rule.radioValidation === "TARGET_ONLY")
    )
      return fail;
    const document = input.ownerDocument;
    const value = item.profileValue ?? "";
    if (rule.kind === "radio") {
      if (item.analysis?.writePlan?.command !== "CHECK_RADIO") return fail;
      if (
        rule.priority &&
        (item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
          item.analysis.interactionStatus !== "READY")
      )
        return fail;
      const group = radioGroup(document, rule);
      if (
        !group ||
        group.length !== handle.elements.length ||
        !group.every((el) => handle.elements.includes(el))
      )
        return fail;
      const target = group.find(
        (el) =>
          text(el.labels?.[0]?.textContent) === value &&
          el.value === rule.options?.[value],
      );
      if (target?.checked && rule.acceptAlreadySelected && visible(target, true)) return success;
      if (!target || !visible(target)) return fail;
      if (target.checked) return success;
      if (!rule.overwrite && group.some((el) => el.checked)) return fail;
      target.click();
      const after = radioGroup(document, rule);
      return {
        handled: true,
        written:
          !!after &&
          after.every((el) => group.includes(el)) &&
          after.includes(target) &&
          target.checked &&
          visible(target),
      };
    }
    if (
      handle.elements.length !== 1 ||
      !gatesPass(document, rule, policy.fields)
    )
      return fail;
    if (rule.kind === "select") {
      if (
        !(input instanceof HTMLSelectElement) ||
        item.analysis?.writePlan?.command !== "SELECT_OPTION" ||
        named(document, rule.name).length !== 1
      )
        return fail;
      const target = option(input, value, rule);
      if (!target) return fail;
      if (input.selectedOptions[0] === target) return success;
      if (!rule.overwrite && input.value !== "") return fail;
      setNative(input, target.value);
      return {
        handled: true,
        written:
          option(input, value, rule) === target &&
          input.selectedOptions[0] === target &&
          gatesPass(document, rule, policy.fields),
      };
    }
    if (
      !(input instanceof HTMLInputElement) ||
      item.analysis?.writePlan?.command !== "SET_TEXT" ||
      !value
    )
      return fail;
    if (rule.kind === "yearMonth") {
      if (
        input.type !== rule.inputType ||
        input.maxLength !== rule.maxLength ||
        !/^\d{4}-\d{2}$/.test(value)
      )
        return fail;
    } else if (input.type !== "text" || named(document, rule.name).length !== 1)
      return fail;
    if (input.value === value) return success;
    if (!rule.overwrite && input.value !== "") return fail;
    setNative(
      input,
      rule.kind === "yearMonth" && rule.inputFormat === "YYYYMM"
        ? value.replace("-", "")
        : value,
    );
    return {
      handled: true,
      written:
        visible(input) &&
        input.value === value &&
        gatesPass(document, rule, policy.fields),
    };
  },
};
