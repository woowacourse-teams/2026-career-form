import { debugRuntimeSkip } from "../../debug/structural-diagnostics";
import type { MatchedFieldAnalysis } from "../../api/types";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { addressWithoutRoadReference } from "../../address/match";
import { normalizeStagedRoad } from "../../policy/staged-address-road";
import { basicSpecs } from "./basic-controls";
import { detailTargetValue } from "./detail-write";
import {
  dropdownBody,
  isSelectedToggle,
  rowDropdowns,
  ownedV1Control,
  v1AllControls,
  v1BasicControls,
  v1ControlValue,
  v1Drivers,
  v1Name,
  v1Spec,
  v1Specs,
  type V1Control,
  type V1Driver,
  type V1Key,
} from "./v1-basic-controls";

export type V1WriteResult = "written" | "failed" | "option-unmatched";

const conditionalKeys: readonly V1Key[] = [
  "gender",
  "nationality",
  "emergencyPhone",
  "postalCode",
  "addressLine1",
  "addressLine2",
];

/** Road addresses compared without a trailing legal-dong reference and with
 * the province alias folded (the existing staged-address normalization). */
export function sameV1Road(shown: string, target: string): boolean {
  const road = (value: string) =>
    normalizeStagedRoad(addressWithoutRoadReference(value));
  return road(shown) !== "" && road(shown) === road(target);
}

export function v1Approved(
  key: V1Key,
  item: Pick<ReviewPlanItem, "analysis">,
): boolean {
  return approved(key, item);
}

function approved(key: V1Key, item: Pick<ReviewPlanItem, "analysis">): boolean {
  const spec = v1Spec(key),
    a = item.analysis,
    b = a?.valueBinding;
  if (
    a?.mappingStatus !== "ADAPTER_VERIFIED" ||
    a.interactionStatus !== "READY" ||
    !(
      a.autofillPolicy === "ALLOWED" ||
      (conditionalKeys.includes(key) && a.autofillPolicy === "CONDITIONAL")
    ) ||
    a.writePlan?.command !==
      (spec.kind === "radio" || spec.kind === "toggle"
        ? "CHECK_RADIO"
        : spec.kind === "dropdown"
          ? "SELECT_OPTION"
          : "SET_TEXT")
  )
    return false;
  if (key === "englishName")
    return (
      b?.type === "DERIVED" && b.recipe === "ENGLISH_FULL_NAME_FAMILY_FIRST"
    );
  if (b?.profileFieldKey !== ("profile" in spec ? spec.profile : undefined))
    return false;
  if (key === "disabilityStatus" || key === "veteranStatus")
    return (
      b?.type === "DERIVED" &&
      b.recipe === "BOOLEAN_YN" &&
      b.trueLabel === "대상" &&
      b.falseLabel === "비대상"
    );
  if (spec.kind === "text" || spec.kind === "date" || spec.kind === "address")
    return b?.type === "DIRECT";
  if (b?.type !== "LOOKUP") return false;
  // The plan reuses the MRS2 maps; their labels are accepted in the map,
  // but only a label the v1 catalog offers is ever written (v1Target).
  const mrs2 =
    key in basicSpecs ? basicSpecs[key as keyof typeof basicSpecs] : undefined;
  const labels = [
    ...Object.values(spec.options),
    ...(mrs2 && "options" in mrs2 ? Object.values(mrs2.options) : []),
  ] as string[];
  const targets = Object.values(b.optionMap);
  return targets.length > 0 && targets.every((t) => labels.includes(t));
}

export function isV1StateDriver(
  item: ReviewPlanItem,
  name: string | undefined,
): boolean {
  return v1Drivers.some((key) => name === v1Name(key) && approved(key, item));
}

/** A profile date as the page's YYYY.MM.DD; service dates may be month-only. */
function dateTarget(key: V1Key, value: string): string | undefined {
  if (key === "birthday") return detailTargetValue("birthday", value);
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
    ? m[3]
      ? `${m[1]}.${m[2]}.${m[3]}`
      : `${m[1]}.${m[2]}`
    : undefined;
}

/** The value to write, in page terms, or undefined when it cannot be written. */
export function v1Target(key: V1Key, value: string): string | undefined {
  if (!value.trim()) return undefined;
  const spec = v1Spec(key);
  if (spec.kind === "date") return dateTarget(key, value);
  if (key === "emergencyPhone")
    return detailTargetValue("emergencyPhone", value);
  if (spec.kind === "text" || spec.kind === "address") return value;
  return (Object.values(spec.options) as string[]).includes(value)
    ? value
    : undefined;
}

/** Whether the page shows `target`; service dates at the page's month precision. */
export function v1Shows(key: V1Key, shown: string, target: string): boolean {
  return (
    shown === target ||
    (key === "addressLine1" && sameV1Road(shown, target)) ||
    ((key === "serviceStartDate" || key === "serviceEndDate") &&
      /^\d{4}\.\d{2}\.\d{2}$/.test(target) &&
      shown === target.slice(0, 7))
  );
}

/** Result comparison for a v1 date against the profile's stored form. */
export function v1ResultMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  current: string,
  expected: string,
): boolean | undefined {
  const control = ownedV1Control(handle);
  if (
    !control ||
    (v1Spec(control.key).kind !== "date" &&
      v1Spec(control.key).kind !== "address") ||
    handle.candidateId !== item.candidateId ||
    !approved(control.key, item)
  )
    return undefined;
  const target = v1Target(control.key, expected);
  return target !== undefined && v1Shows(control.key, current, target);
}

/** Existing-value check: the page writes the chosen road with its legal-dong
 * reference, which is the profile road, not a conflicting value. */
export function v1SameExistingValue(
  handle: FieldCandidateHandle,
  item: Pick<ReviewPlanItem, "analysis">,
  page: string,
  profile: string,
): boolean {
  return (
    ownedV1Control(handle)?.key === "addressLine1" &&
    approved("addressLine1", item) &&
    sameV1Road(page, profile)
  );
}

/** Measured placeholders of the out-of-scope dropdowns in the status rows. */
const outOfScopePlaceholders = [
  "편의 제공 여부 선택",
  "보훈비율을 선택해주세요.",
];
const dropdownPlaceholders = new Set<string>([
  ...outOfScopePlaceholders,
  ...Object.values(v1Specs).flatMap((s) =>
    s.kind === "dropdown" ? [s.placeholder] : [],
  ),
]);

/** Any input or dropdown of the row holds a value, verified or not. */
function rowHoldsValue(row: Element): boolean {
  return (
    Array.from(row.querySelectorAll("input")).some((i) =>
      i.type === "radio" || i.type === "checkbox" ? i.checked : i.value !== "",
    ) ||
    rowDropdowns(row).some(
      (t) =>
        !dropdownPlaceholders.has(
          t.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ),
    )
  );
}

/** The status toggles start on 비대상: a page default the profile may replace,
 * but only while every input and dropdown of the row is still empty. */
function defaultToggle(control: V1Control): boolean {
  const spec = v1Spec(control.key);
  if (
    spec.kind !== "toggle" ||
    v1ControlValue(control) !== "비대상" ||
    rowHoldsValue(control.row)
  )
    return false;
  return v1AllControls(control.row.ownerDocument).every((other) => {
    const otherSpec = v1Spec(other.key);
    if (!("parent" in otherSpec) || otherSpec.parent !== control.key)
      return true;
    return v1ControlValue(other) === "";
  });
}

export function prefersV1ProfileValue(
  handle: FieldCandidateHandle,
  analysis: MatchedFieldAnalysis,
): boolean {
  const control = ownedV1Control(handle);
  return (
    !!control && approved(control.key, { analysis }) && defaultToggle(control)
  );
}

export function v1Retained(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const control = ownedV1Control(handle);
  if (!control || !approved(control.key, item)) return false;
  const target = v1Target(control.key, item.profileValue ?? "");
  const shown = v1ControlValue(control);
  return (
    target !== undefined &&
    shown !== undefined &&
    v1Shows(control.key, shown, target)
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
/** Bounded wait for a page reaction; false on timeout or a stale context. */
export async function waitFor(
  done: () => boolean,
  current: () => boolean,
  ms = 1500,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (true) {
    if (!current()) return false;
    if (done()) return true;
    if (Date.now() >= deadline) return false;
    await tick();
  }
}

export const setValue = (input: HTMLInputElement, value: string) =>
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);

export async function writeV1(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  currentRun: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<V1WriteResult> {
  const control = ownedV1Control(handle);
  if (!control) return "failed";
  const { key } = control;
  const spec = v1Spec(key);
  // The address triplet is written only as one dialog run (v1-address.ts).
  if (spec.kind === "address") return "failed";
  const document = control.row.ownerDocument;
  const value = item.profileValue;
  const target = v1Target(key, value ?? "");
  const original = v1ControlValue(control);
  if (original === undefined || !approved(key, item)) return "failed";
  // An approved label the v1 catalog does not offer (e.g. an MRS2-only one).
  if (!target)
    return "options" in spec && value?.trim() ? "option-unmatched" : "failed";
  const override =
    original !== "" && original !== target && defaultToggle(control);
  const url = document.URL;
  // Values the page may show at this point of the write.
  let allowed = [original];
  const owned = () => {
    const now = ownedV1Control(handle);
    const shown = now && v1ControlValue(now);
    return (
      currentRun() &&
      document.URL === url &&
      item.profileValue === value &&
      item.selected &&
      !item.disabled &&
      (item.status === "available" ||
        (item.status === "needs-review" && conditionalKeys.includes(key))) &&
      item.candidateId === handle.candidateId &&
      item.analysis?.candidateId === handle.candidateId &&
      approved(key, item) &&
      shown !== undefined &&
      allowed.includes(shown)
    );
  };
  if (!owned()) return "failed";
  if (v1Shows(key, original, target)) return "written";
  if (original !== "" && !override) return "failed";
  const input = control.elements[0];
  if (
    (spec.kind === "text" || spec.kind === "date") &&
    input.maxLength >= 0 &&
    target.length > input.maxLength
  )
    return "failed";
  try {
    if (beforeMutation && !(await beforeMutation())) return "failed";
  } catch {
    return "failed";
  }
  if (!owned()) return "failed";
  const shows = () => {
    const now = ownedV1Control(handle);
    const shown = now && v1ControlValue(now);
    return shown !== undefined && v1Shows(key, shown, target);
  };
  if (spec.kind === "text" || spec.kind === "date") {
    input.focus();
    if (!owned()) return "failed";
    setValue(input, target);
    allowed = [original, target, target.slice(0, 7)];
    for (const type of ["input", "change"]) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
      if (!owned()) return "failed";
    }
    input.blur();
    // The page may normalize the date after blur (YYYY.MM for service dates).
    return (await waitFor(shows, owned)) && input.checkValidity()
      ? "written"
      : "failed";
  }
  if (spec.kind === "radio") {
    const radio = [...control.options].find(
      ([code]) => spec.options[code as keyof typeof spec.options] === target,
    )?.[1] as HTMLInputElement | undefined;
    const label = radio?.closest("label");
    if (!radio || !label) return "failed";
    allowed = [original, target];
    // The input itself ignores clicks; the wrapping label changes the state.
    label.click();
    return (await waitFor(() => radio.checked && shows(), owned))
      ? "written"
      : "failed";
  }
  if (spec.kind === "toggle") {
    const button = control.options.get(target);
    if (
      !(button instanceof HTMLButtonElement) ||
      button.textContent?.trim() !== target
    )
      return "failed";
    allowed = [original, target];
    button.click();
    return (await waitFor(
      () =>
        isSelectedToggle(button) &&
        control.custom.filter(isSelectedToggle).length === 1 &&
        shows(),
      owned,
    ))
      ? "written"
      : "failed";
  }
  return writeDropdown(control, target, owned, shows, (next) => {
    allowed = next;
  });
}

async function writeDropdown(
  control: V1Control,
  target: string,
  owned: () => boolean,
  shows: () => boolean,
  allow: (values: string[]) => void,
): Promise<V1WriteResult> {
  const spec = v1Specs[control.key] as { options: Record<string, string> };
  const code = Object.entries(spec.options).find(([, l]) => l === target)?.[0];
  return writeV1Dropdown(
    control.custom[0],
    target,
    code,
    v1Name(control.key),
    v1ControlValue(control) ?? "",
    owned,
    shows,
    allow,
  );
}

/**
 * One v1 button dropdown write: open the trigger, require exactly one option
 * button whose text is `target` (and whose value is `code` when known), click
 * it and verify the label; the body is closed on any failure.
 */
export async function writeV1Dropdown(
  trigger: HTMLButtonElement,
  target: string,
  code: string | undefined,
  diagnosticName: string,
  original: string,
  owned: () => boolean,
  shows: () => boolean,
  allow: (values: string[]) => void,
): Promise<V1WriteResult> {
  /** Closes the open body; false (with a diagnostic) when the page keeps it open. */
  const close = async () => {
    if (!dropdownBody(trigger) || !trigger.isConnected) return true;
    trigger.click();
    if (
      (await waitFor(
        () => !dropdownBody(trigger),
        () => trigger.isConnected,
      )) ||
      !trigger.isConnected
    )
      return true;
    debugRuntimeSkip(diagnosticName, "cleanup-failed", "v1-dropdown-close");
    return false;
  };
  allow([original]);
  trigger.click();
  if (!(await waitFor(() => !!dropdownBody(trigger), owned))) {
    await close();
    return "failed";
  }
  const body = dropdownBody(trigger)!;
  const matches = Array.from(
    body.querySelectorAll<HTMLButtonElement>("ul > li > button"),
  ).filter((b) => b.textContent?.trim() === target);
  if (matches.length === 0)
    return (await close()) ? "option-unmatched" : "failed";
  if (
    matches.length !== 1 ||
    (code !== undefined && matches[0].value !== code)
  ) {
    await close();
    return "failed";
  }
  allow([original, target]);
  matches[0].click();
  const done = await waitFor(() => !dropdownBody(trigger) && shows(), owned);
  if (!done) await close();
  return done ? "written" : "failed";
}

/** After a status driver write: wait until its row's dependents unlock. */
export async function settleV1StateDriver(
  handle: FieldCandidateHandle,
  signal?: AbortSignal,
  item?: ReviewPlanItem,
): Promise<boolean> {
  const control = ownedV1Control(handle);
  if (
    !control ||
    !item ||
    item.candidateId !== handle.candidateId ||
    !item.selected ||
    item.disabled ||
    !approved(control.key, item) ||
    !v1Retained(handle, item)
  )
    return false;
  const spec = v1Spec(control.key);
  if (spec.kind !== "toggle") return true;
  const driver = control.key as V1Driver;
  const document = control.row.ownerDocument;
  const url = document.URL;
  const unlocking = v1ControlValue(control) === spec.unlocks;
  const dependents = (Object.keys(v1Specs) as V1Key[]).filter((key) => {
    const s = v1Spec(key);
    return "parent" in s && s.parent === driver;
  });
  // Only the measured unlocking label is awaited; other states settle as is
  // and the next analysis pass collects whatever the page opened.
  const ready = () => {
    if (!unlocking) return true;
    const located = v1AllControls(document);
    const open = new Set(v1BasicControls(document).map((c) => c.key));
    return dependents.every(
      (key) => !located.some((c) => c.key === key) || open.has(key),
    );
  };
  const settled = await waitFor(
    ready,
    () =>
      !signal?.aborted &&
      document.URL === url &&
      item.selected &&
      !item.disabled &&
      v1Retained(handle, item),
  );
  if (!settled)
    debugRuntimeSkip(v1Name(driver), "disabled-timeout", "v1-linked-controls");
  return settled;
}

/** A failed status driver defers its own row. */
export function v1DriverRow(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
): Element | undefined {
  return isV1StateDriver(item, handle.candidate.domName)
    ? ownedV1Control(handle)?.row
    : undefined;
}
