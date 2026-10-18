import { nativeTarget, nativeValueMatches } from "../policy/native-form-write";
import {
  ownedBasicControl,
  basicSpecs,
} from "../adapters/hplace/basic-controls";
import { basicTarget } from "../adapters/hplace/basic-write";
import { ownedDetailControl } from "../adapters/hplace/detail";
import { detailTargetValue } from "../adapters/hplace/detail-write";
import { componentRules } from "../policy/runtime-rules";
import { componentSelector } from "../policy/component-dom";
import { executionPolicy } from "./execution-policy";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { catalogApprovalForItem } from "../profile/catalog-identity";
import { retainedCatalogSelection } from "../profile/catalog-receipt";
import {
  PROFILE_CATEGORIES,
  type ProfileInputType,
} from "../../profile/field-definitions";

const fieldTypes = new Map<string, ProfileInputType>(
  PROFILE_CATEGORIES.flatMap((category) =>
    category.sections.flatMap((section) =>
      section.fields.map(
        (field) =>
          [
            `${category.id}.${section.id}.${field.id}`,
            field.inputType,
          ] as const,
      ),
    ),
  ),
);

function dateDigits(value: string, monthOnly: boolean): string | undefined {
  const match = monthOnly
    ? value.match(/^(\d{4})-?(\d{2})$/)
    : value.match(/^(\d{4})(-?)(\d{2})\2(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[monthOnly ? 2 : 3]);
  if (year < 1 || month < 1 || month > 12) return undefined;
  if (!monthOnly) {
    const day = Number(match[4]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > days[month - 1]) return undefined;
  }
  return value.replaceAll("-", "");
}

function telephoneDigits(value: string): string | undefined {
  if (!/^(?:0\d{8,10}|0\d{1,2}([ -])\d{3,4}\1\d{4})$/.test(value))
    return undefined;
  return value.replace(/[ -]/g, "");
}

function componentDatePrecision(
  item: ReviewPlanItem,
  key: string | undefined,
  handle?: FieldCandidateHandle,
): "month" | "day" | undefined {
  const trigger = handle?.customElements?.[0];
  const name = handle?.candidate.domName;
  if (
    !trigger?.isConnected ||
    !name ||
    handle?.candidateId !== item.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
    handle.isCurrentContext?.() === false ||
    trigger.getAttribute("name") !== name ||
    !trigger.matches(componentSelector(trigger, "calendarTrigger"))
  )
    return undefined;
  return executionPolicy(
    trigger.ownerDocument,
  )?.componentPolicy?.dateRules?.find(
    (rule) => rule.key === key && new RegExp(rule.pattern).test(name),
  )?.precision;
}

function componentExactDisplayFormat(
  item: ReviewPlanItem,
  current: string,
  expected: string,
  handle?: FieldCandidateHandle,
): boolean | undefined {
  const name = handle?.candidate.domName;
  const element = handle && (handle.elements[0] ?? handle.customElements?.[0]);
  const binding = item.analysis?.valueBinding;
  if (
    !name ||
    !element?.isConnected ||
    handle?.candidateId !== item.candidateId ||
    item.analysis?.candidateId !== item.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    binding?.type !== "DIRECT" ||
    handle.isCurrentContext?.() === false ||
    element.getAttribute("name") !== name
  )
    return undefined;
  const rule = executionPolicy(
    element.ownerDocument,
  )?.componentPolicy?.displayFormats.find(
    (rule) =>
      rule.key === binding.profileFieldKey &&
      rule.control === handle.candidate.control &&
      new RegExp(rule.pattern).test(name),
  );
  if (
    rule &&
    new RegExp(rule.valuePattern).test(current) &&
    new RegExp(rule.valuePattern).test(expected)
  )
    return rule.mode === "DECIMAL"
      ? Number(current) === Number(expected)
      : current.replaceAll("-", "") === expected.replaceAll("-", "");
  return undefined;
}

export function matchesResultValue(
  item: ReviewPlanItem,
  current: string,
  expected: string,
  handle?: FieldCandidateHandle,
): boolean {
  if (handle?.owner === "native")
    return (
      nativeValueMatches(handle, item) &&
      current.trim() === (nativeTarget(handle, expected) ?? expected)
    );
  const left = current.trim();
  const right = expected.trim();
  if (!left || !right) return false;
  const approval = catalogApprovalForItem(item);
  if (approval.status === "invalid") return false;
  if (approval.status === "selected") {
    const element =
      handle?.buttonDropdown?.trigger ??
      handle?.elements[0] ??
      handle?.customElements?.[0];
    if (
      !element ||
      handle?.candidateId !== item.candidateId ||
      handle.isCurrentContext?.() === false
    )
      return false;
    const retained = retainedCatalogSelection(item, element);
    if (retained !== undefined)
      return (
        current === retained &&
        (expected === item.profileValue || right === approval.match.query)
      );
    return (
      item.analysis?.writePlan?.command === "SET_TEXT" &&
      !handle.buttonDropdown &&
      element.getAttribute("role") !== "combobox" &&
      left === right &&
      right === approval.match.query
    );
  }
  if (left === right) return true;
  const element = handle?.elements[0];
  const policyBinding = item.analysis?.valueBinding;
  if (
    element instanceof HTMLInputElement &&
    element.isConnected &&
    handle?.candidateId === item.candidateId &&
    handle.isCurrentContext?.() !== false &&
    item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
    policyBinding?.type === "DIRECT" &&
    item.analysis.writePlan?.command === "SET_TEXT"
  ) {
    const rule = executionPolicy(
      element.ownerDocument,
    )?.browserPolicy?.resultComparisons?.find(
      (r) =>
        r.name === element.name &&
        r.name === handle.candidate.domName &&
        r.key === policyBinding.profileFieldKey,
    );
    if (rule?.mode === "GROUPED_NUMBER") {
      // Accept only valid digit grouping; do not erase arbitrary punctuation.
      const numeric = /^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/;
      return (
        numeric.test(left) &&
        numeric.test(right) &&
        left.replaceAll(",", "") === right.replaceAll(",", "")
      );
    }
  }
  const componentDisplayMatch = componentExactDisplayFormat(
    item,
    left,
    right,
    handle,
  );
  if (componentDisplayMatch !== undefined) return componentDisplayMatch;
  const binding = item.analysis?.valueBinding;
  const basic = handle && ownedBasicControl(handle);
  if (
    basic &&
    (basic.key === "serviceStartDate" || basic.key === "serviceEndDate") &&
    handle?.candidateId === item.candidateId &&
    item.analysis?.candidateId === item.candidateId &&
    item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === basicSpecs[basic.key].profile
  ) {
    return basicTarget(basic.key, right) === left;
  }
  if (binding?.type === "LOOKUP" || binding?.type === "BUTTON_OPTION")
    return false;
  if (binding?.type === "DERIVED" && binding.recipe !== "YEAR_MONTH")
    return false;
  if (
    handle &&
    ownedDetailControl(handle)?.key === "birthday" &&
    handle.candidateId === item.candidateId &&
    item.analysis?.candidateId === item.candidateId &&
    item.analysis.mappingStatus === "ADAPTER_VERIFIED" &&
    item.analysis.writePlan?.command === "SET_TEXT" &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === "personal.personal.birthDate"
  ) {
    const target = detailTargetValue("birthday", right);
    return target !== undefined && left === target;
  }
  const key = binding?.profileFieldKey ?? item.profileFieldKey;
  const kind = key ? fieldTypes.get(key) : undefined;
  const precision = componentDatePrecision(item, key, handle);
  if (precision) {
    const monthOnly = precision === "month";
    const document = (handle!.elements[0] ?? handle!.customElements?.[0])!
      .ownerDocument;
    const formats = componentRules(document).calendar;
    const dotted = new RegExp(
      monthOnly ? formats.resultMonthPattern : formats.resultDayPattern,
    );
    const rendered = dotted.test(left)
      ? left.replace(new RegExp(formats.resultSeparatorPattern, "g"), "-")
      : left;
    const actual = dateDigits(rendered, monthOnly);
    const fullExpected = dateDigits(right, false);
    const expectedDate = monthOnly
      ? (dateDigits(right, true) ?? fullExpected?.slice(0, 6))
      : fullExpected;
    return actual !== undefined && actual === expectedDate;
  }
  const normalize =
    kind === "date"
      ? (value: string) => dateDigits(value, binding?.type === "DERIVED")
      : kind === "tel" && binding?.type !== "DERIVED"
        ? telephoneDigits
        : undefined;
  if (!normalize) return false;
  const normalized = normalize(left);
  return normalized !== undefined && normalized === normalize(right);
}
