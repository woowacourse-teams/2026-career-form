import type { MatchedFieldAnalysis } from "../../api/types";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import {
  basicControls,
  basicSpecs,
  basicName,
  ownedBasicControl,
  type BasicKey,
  type BasicControl,
} from "./basic-controls";
export function isBasicStateDriver(
  item: ReviewPlanItem,
  name?: string,
): boolean {
  return (
    ["veteranStatus", "disabilityStatus", "militaryStatus"] as BasicKey[]
  ).some((key) => name === basicName(key) && bindingApproved(key, item));
}
function bindingApproved(
  key: BasicKey,
  item: Pick<ReviewPlanItem, "analysis">,
): boolean {
  const spec = basicSpecs[key],
    a = item.analysis,
    b = a?.valueBinding;
  if (
    a?.mappingStatus !== "ADAPTER_VERIFIED" ||
    a.interactionStatus !== "READY" ||
    !(
      a.autofillPolicy === "ALLOWED" ||
      ((key === "gender" || key === "nationality") &&
        a.autofillPolicy === "CONDITIONAL")
    ) ||
    b?.profileFieldKey !== spec.profile ||
    a.writePlan?.command !==
      (spec.kind === "radio"
        ? "CHECK_RADIO"
        : spec.kind === "select"
          ? "SELECT_OPTION"
          : "SET_TEXT")
  )
    return false;
  if (key === "veteranStatus" || key === "disabilityStatus")
    return (
      b.type === "DERIVED" &&
      b.recipe === "BOOLEAN_YN" &&
      b.trueLabel === "대상" &&
      b.falseLabel === "비대상"
    );
  if (spec.kind === "text") return b.type === "DIRECT";
  if (b.type !== "LOOKUP" || !("options" in spec)) return false;
  const allowed: Record<string, string> = Object.fromEntries(
    Object.values(spec.options).map((label) => [label, label]),
  );
  if (key === "gender") {
    delete allowed["남"];
    delete allowed["여"];
    allowed["남성"] = "남";
    allowed["여성"] = "여";
  }
  if (key === "disabilityGrade")
    Object.assign(allowed, {
      중증: "심한 장애인",
      "중증(심한장애)": "심한 장애인",
      경증: "심하지 않은 장애인",
      "경증(심하지 않은 장애)": "심하지 않은 장애인",
    });
  if (key === "disabilityType")
    Object.assign(allowed, {
      안면장애: "안면변형장애",
      "장루・요루장애": "장루/요루장애",
      기타: "기타장애",
    });
  return (
    Object.keys(b.optionMap).length > 0 &&
    Object.entries(b.optionMap).every(
      ([source, target]) => allowed[source] === target,
    )
  );
}
// Only these two verified HTML false defaults may yield to the profile.
// Read disabled dependents too: even an uncollected rate or hidden value is data.
function emptyBooleanDefault(control: BasicControl): boolean {
  if (control.key !== "veteranStatus" && control.key !== "disabilityStatus")
    return false;
  const selected = control.elements.filter(
    (e): e is HTMLInputElement => e instanceof HTMLInputElement && e.checked,
  );
  if (
    selected.length !== 1 ||
    selected[0].value !== "false" ||
    !selected[0].defaultChecked ||
    control.elements.some(
      (e) =>
        e !== selected[0] && e instanceof HTMLInputElement && e.defaultChecked,
    )
  )
    return false;
  const prefix = control.key === "veteranStatus" ? "patriot" : "handicap";
  const subject = selected[0].closest(".subject");
  return Array.from(
    selected[0].ownerDocument.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      `input[name^="${prefix}."],select[name^="${prefix}."],textarea[name^="${prefix}."],[data-rel-target="${prefix}"]`,
    ),
  ).every(
    (e) =>
      control.elements.includes(e as HTMLInputElement) ||
      (e.closest(".subject") === subject &&
        (e instanceof HTMLInputElement && ["radio", "checkbox"].includes(e.type)
          ? !e.checked
          : e.value === "")),
  );
}
export function prefersBasicProfileValue(
  handle: FieldCandidateHandle,
  analysis: MatchedFieldAnalysis,
): boolean {
  const control = ownedBasicControl(handle);
  return (
    !!control &&
    bindingApproved(control.key, { analysis }) &&
    emptyBooleanDefault(control)
  );
}
export function basicValue(handle: FieldCandidateHandle): string | undefined {
  const control = ownedBasicControl(handle);
  if (!control) return undefined;
  const input = control.elements[0];
  if (input instanceof HTMLSelectElement) {
    const option = input.selectedOptions[0];
    return !option?.value
      ? ""
      : control.options.get(option.value) === option
        ? option.textContent?.trim()
        : undefined;
  }
  if (input.type === "radio") {
    const selected = control.elements.filter(
      (e) => e instanceof HTMLInputElement && e.checked,
    ) as HTMLInputElement[];
    return selected.length === 0
      ? ""
      : selected.length === 1
        ? (basicSpecs[control.key] as { options: Record<string, string> })
            .options[selected[0].value]
        : undefined;
  }
  return input.value;
}
export function basicTarget(key: BasicKey, value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (key !== "serviceStartDate" && key !== "serviceEndDate") return value;
  const m = /^(\d{4})[-.](\d{2})(?:[-.](\d{2}))?$/.exec(value);
  if (!m) return undefined;
  const y = Number(m[1]),
    month = Number(m[2]),
    day = Number(m[3] ?? 1);
  const date = new Date(Date.UTC(y, month - 1, day));
  return y >= 1900 &&
    y <= new Date().getFullYear() &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${m[1]}.${m[2]}`
    : undefined;
}
export function basicDateOrder(
  handle: FieldCandidateHandle,
  target: string,
): boolean {
  const key = handle.candidate.domName?.split(".").at(-1);
  if (key !== "serviceStartDate" && key !== "serviceEndDate") return true;
  const input = handle.elements[0],
    otherKey =
      key === "serviceStartDate" ? "serviceEndDate" : "serviceStartDate";
  const other = basicControls(input.ownerDocument).find(
    (c) => c.key === otherKey,
  )?.elements[0];
  if (!other || other.closest(".subject") !== input.closest(".subject"))
    return false;
  if (!other.value) return true;
  const otherValue = basicTarget(otherKey, other.value);
  return (
    otherValue !== undefined &&
    otherValue === other.value &&
    (key === "serviceStartDate" ? target <= otherValue : target >= otherValue)
  );
}
export async function settleBasicStateDriver(
  handle: FieldCandidateHandle,
  signal?: AbortSignal,
  item?: ReviewPlanItem,
): Promise<boolean> {
  const control = ownedBasicControl(handle);
  if (
    !control ||
    !item ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== handle.candidateId ||
    !item.selected ||
    item.disabled ||
    !bindingApproved(control.key, item) ||
    basicValue(handle) !== basicTarget(control.key, item.profileValue ?? "")
  )
    return false;
  const key = control.key;
  if (!["veteranStatus", "disabilityStatus", "militaryStatus"].includes(key))
    return true;
  const selected = control.elements.find(
    (e) => e instanceof HTMLInputElement && e.checked,
  ) as HTMLInputElement | undefined;
  if (!selected || signal?.aborted) return false;
  const document = selected.ownerDocument;
  const url = document.URL;
  const expected = basicTarget(key, item.profileValue ?? "");
  const ready = () => {
    const controls = basicControls(document);
    return (Object.keys(basicSpecs) as BasicKey[]).every((childKey) => {
      const spec = basicSpecs[childKey];
      if (!("parent" in spec) || spec.parent !== key) return true;
      const active =
        key === "militaryStatus"
          ? spec.target === "noneMilitary"
            ? selected.value === "03"
            : ["01", "04"].includes(selected.value)
          : selected.value === "true";
      if (!active) return true;
      const nodes = document.querySelectorAll(`[name="${spec.name}"]`);
      return (
        nodes.length === 0 ||
        controls.some(
          (c) =>
            c.key === childKey &&
            c.elements[0].closest(".subject") === selected.closest(".subject"),
        )
      );
    });
  };
  const deadline = Date.now() + 1500;
  while (true) {
    if (
      signal?.aborted ||
      document.URL !== url ||
      !ownedBasicControl(handle) ||
      !item.selected ||
      item.disabled ||
      !bindingApproved(key, item) ||
      basicTarget(key, item.profileValue ?? "") !== expected ||
      basicValue(handle) !== expected
    )
      return false;
    if (ready()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function linkedTargetsOwned(element: Element): boolean {
  const group = element.closest("[data-rel-id]");
  if (!group) return true;
  const subject = element.closest(".subject");
  const pending = group.getAttribute("data-rel-id")!.split(/\s+/),
    seen = new Set<string>();
  while (pending.length) {
    const token = pending.shift()!;
    if (seen.has(token)) continue;
    seen.add(token);
    if (!/^[a-zA-Z]+$/.test(token)) return false;
    const targets = element.ownerDocument.querySelectorAll(
      `[data-rel-target="${token}"],[data-rel-id~="${token}"]`,
    );
    for (const target of targets) {
      if (
        target.closest(".subject") !== subject ||
        target.matches(
          'input[type="password"],input[type="checkbox"],button[type="submit"]',
        ) ||
        target.querySelector(
          'input[type="password"],input[type="checkbox"],button[type="submit"]',
        )
      )
        return false;
      const nested = target.getAttribute("data-rel-id");
      if (nested) pending.push(...nested.split(/\s+/));
    }
  }
  return true;
}
export async function writeBasic(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<boolean> {
  const control = ownedBasicControl(handle);
  if (!control) return false;
  const { key, elements, options } = control;
  const value = item.profileValue;
  const target = basicTarget(key, value ?? "");
  if (!target) return false;
  const original = basicValue(handle),
    url = elements[0].ownerDocument.URL;
  const defaultOverride = target === "대상" && emptyBooleanDefault(control);
  let expected = original;
  const current = () =>
    currentRun() &&
    elements[0].ownerDocument.URL === url &&
    item.profileValue === value &&
    item.selected &&
    !item.disabled &&
    (item.status === "available" ||
      ((key === "gender" || key === "nationality") &&
        item.status === "needs-review")) &&
    item.candidateId === handle.candidateId &&
    item.analysis?.candidateId === handle.candidateId &&
    bindingApproved(key, item) &&
    ownedBasicControl(handle) !== undefined &&
    basicDateOrder(handle, target) &&
    linkedTargetsOwned(elements[0]) &&
    basicValue(handle) === expected &&
    (!defaultOverride || expected !== original || emptyBooleanDefault(control));
  if (
    original === undefined ||
    (original !== "" && original !== target && !defaultOverride) ||
    !current()
  )
    return false;
  const spec = basicSpecs[key];
  let chosen: HTMLElement | undefined;
  if (spec.kind !== "text") {
    const matches = [...options.values()].filter(
      (e) =>
        (e instanceof HTMLOptionElement
          ? e.textContent?.trim()
          : (spec.options as Record<string, string>)[
              (e as HTMLInputElement).value
            ]) === target,
    );
    if (matches.length !== 1) return false;
    chosen = matches[0];
  }
  const input = elements[0];
  if (
    input instanceof HTMLInputElement &&
    spec.kind === "text" &&
    input.maxLength >= 0 &&
    target.length > input.maxLength
  )
    return false;
  if (original === target) return true;
  try {
    if (beforeMutation && !(await beforeMutation())) return false;
  } catch {
    return false;
  }
  if (!current()) return false;
  const eventTarget = chosen instanceof HTMLInputElement ? chosen : input;
  eventTarget.focus();
  if (!current()) return false;
  expected = target;
  if (chosen instanceof HTMLInputElement) {
    chosen.click();
    if (!current()) return false;
  } else {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(
      input,
      chosen instanceof HTMLOptionElement ? chosen.value : target,
    );
    for (const type of ["input", "change"]) {
      eventTarget.dispatchEvent(new Event(type, { bubbles: true }));
      if (!current()) return false;
    }
  }
  eventTarget.blur();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return current() && elements.every((e) => e.checkValidity());
}
