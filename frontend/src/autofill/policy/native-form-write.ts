import { nativeGpaTarget, nativeGpaComplete } from "./native-form-gpa";
import {
  nativeRowWritable,
  recordNativeRowWrite,
} from "./native-form-row-state";
import { nativeSingleEntityAssigned } from "./native-form-row-assignment";
import { nativeUnitMatches } from "./native-form-unit";
import { committedSearchMatches } from "./committed-search";
import { sameValueBinding } from "./binding-equality";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { CompanyWriteAdapter } from "../adapters/write";
import { formatProfileDate } from "../profile/date-format";
import {
  currentNativeOwner,
  nativeOwnership,
  rawNativeName,
  type NativeOwnership,
} from "./native-form-collection";
import { text, visible } from "./primitives";
import { observedGradeLabel } from "./exam-grade-alias";

const driverControls = new WeakMap<FieldCandidateHandle, Set<string>>();
const fail = { handled: true, written: false } as const;
function peerControl(o: NativeOwnership, name: string) {
  const rule = o.section.fields.find((f) => f.name === name);
  if (!rule) return;
  const found = o.row.querySelectorAll(
    `[name="${CSS.escape(rawNativeName(rule.rawName, o.index))}"]`,
  );
  return found.length === 1 && found[0] instanceof HTMLInputElement
    ? found[0]
    : undefined;
}
export function nativeTarget(
  handle: FieldCandidateHandle,
  value: string,
): string | undefined {
  const o = currentNativeOwner(handle),
    el = handle.elements[0];
  if (!o || !o.section.enabled || !el || !value) return;
  if (!nativeUnitMatches(el, o.row, o.field.unit)) return;
  const f = o.field;
  if (f.gpa) return nativeGpaTarget(handle, value);
  if (f.date) {
    if (!(el instanceof HTMLInputElement) || el.type !== "text") return;
    const peer = f.date.peer ? peerControl(o, f.date.peer) : undefined,
      group = rawNativeName(f.date.group, o.index);
    if (!peer && f.date.role !== "SINGLE") return;
    const start = f.date.role === "END" ? peer! : el;
    const tokens = start.getAttribute("data-dates")?.split(/\s+/) ?? [];
    const precision = tokens[0]?.slice(group.length + 1);
    if (
      tokens[0] !== `${group}:${precision}` ||
      !f.date.formats.includes(precision as "YM" | "YMD") ||
      tokens
        .slice(1)
        .some(
          (t) => t !== "forbiddenAfterToday" && !f.date!.tokens?.includes(t),
        ) ||
      (f.date.tokens ?? []).some((t) => !tokens.includes(t)) ||
      tokens.includes("forbiddenAfterToday") !== f.date.forbiddenAfterToday
    )
      return;
    const end = f.date.role === "END" ? el : peer;
    if (
      f.date.role !== "SINGLE" &&
      end!.getAttribute("data-dates") !==
        `${group}:END${f.date.forbiddenAfterToday ? " forbiddenAfterToday" : ""}`
    )
      return;
    const formatted = formatProfileDate(
      value,
      precision === "YM" ? "YYYY.MM" : "YYYY.MM.DD",
    );
    if (formatted.status !== "resolved") return;
    const now = new Date(),
      today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (f.date.forbiddenAfterToday && value > today) return;
    if (f.date.maxDateSelector) {
      const constraints = o.row.querySelectorAll(f.date.maxDateSelector);
      if (constraints.length > 1) return;
      if (constraints.length === 1) {
        const raw = constraints[0].textContent?.trim() ?? "";
        const max = formatProfileDate(
          raw.replaceAll(".", "-"),
          precision === "YM" ? "YYYY.MM" : "YYYY.MM.DD",
        );
        if (max.status !== "resolved" || formatted.value > max.value) return;
      }
    }
    if (peer?.value) {
      const peerSource =
        precision === "YM"
          ? `${peer.value.replaceAll(".", "-")}-01`
          : peer.value.replaceAll(".", "-");
      const valid = formatProfileDate(
        peerSource,
        precision === "YM" ? "YYYY.MM" : "YYYY.MM.DD",
      );
      if (
        valid.status !== "resolved" ||
        valid.value !== peer.value ||
        (f.date.role === "START"
          ? formatted.value > peer.value
          : formatted.value < peer.value)
      )
        return;
    }
    return formatted.value;
  }
  if (f.type === "number") {
    if (
      !(el instanceof HTMLInputElement) ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    )
      return;
    for (const k of ["min", "max", "step"] as const)
      if (f[k] !== undefined && el.getAttribute(k) !== String(f[k])) return;
    const n = Number(value);
    if (
      (f.min !== undefined && n < f.min) ||
      (f.max !== undefined && n > f.max) ||
      (f.step !== undefined && (n - (f.min ?? 0)) % f.step !== 0)
    )
      return;
    return String(n);
  }
  if (
    f.maxLength !== undefined &&
    (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
      el.maxLength !== f.maxLength ||
      value.length > f.maxLength)
  )
    return;
  return value;
}
function authorized(handle: FieldCandidateHandle, item: ReviewPlanItem) {
  const o = currentNativeOwner(handle);
  if (
    !o ||
    !o.section.enabled ||
    !nativeRowWritable(o) ||
    (o.field.gpa &&
      nativeGpaTarget(handle, item.profileValue ?? "") === undefined) ||
    handle.elements.some((e) => !nativeUnitMatches(e, o.row, o.field.unit)) ||
    !item.selected ||
    item.disabled ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== handle.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.interactionStatus !== "READY" ||
    !sameValueBinding(item.analysis.valueBinding, o.field.binding) ||
    /(?:^|\.)existYn$/.test(o.field.rawName) ||
    handle.elements.some((e) => !visible(e) || ("readOnly" in e && e.readOnly))
  )
    return;
  return o;
}
function selectedOption(
  o: NativeOwnership,
  handle: FieldCandidateHandle,
  profileLabel: string,
): HTMLOptionElement | HTMLInputElement | undefined {
  const dynamic = o.field.dynamicOptions;
  const label =
    dynamic?.codeFormat === "OBSERVED"
      ? observedGradeLabel(
          profileLabel,
          o.observedOptions.map((opt) => opt.label),
        )
      : profileLabel;
  const observed = o.observedOptions.filter((opt) => opt.label === label);
  const code =
    dynamic &&
    (dynamic.codeFormat === "OBSERVED" || dynamic.labels.includes(label)) &&
    observed.length === 1 &&
    (dynamic.codeFormat === "OBSERVED"
      ? /^[A-Za-z0-9_-]{1,64}$/.test(observed[0].code) &&
        !/^0+$/.test(observed[0].code)
      : /^[1-9][0-9]{0,11}$/.test(observed[0].code))
      ? observed[0].code
      : o.field.options?.[label];
  if (!code) return;
  const el = handle.elements[0];
  const all =
    el instanceof HTMLSelectElement
      ? Array.from(el.options)
      : (handle.elements as HTMLInputElement[]);
  const labelOf = (e: HTMLOptionElement | HTMLInputElement) =>
    text(
      e instanceof HTMLOptionElement
        ? e.textContent
        : e.labels?.[0]?.textContent,
    );
  const options = all.filter((e) => labelOf(e) === label || e.value === code);
  if (
    options.length !== 1 ||
    labelOf(options[0]) !== label ||
    options[0].value !== code ||
    options[0].disabled ||
    options[0].closest("optgroup:disabled")
  )
    return;
  if (dynamic && options[0] !== observed[0]?.element) return;
  return options[0];
}
export function nativeValueMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  if (nativeOwnership(handle)?.field.search)
    return committedSearchMatches(handle, item);
  const o = authorized(handle, item),
    value = item.profileValue;
  if (!o || value === undefined) return false;
  if (["select", "radio"].includes(o.field.type)) {
    const option = selectedOption(o, handle, value);
    return (
      !!option &&
      (option instanceof HTMLOptionElement ? option.selected : option.checked)
    );
  }
  const target = nativeTarget(handle, value);
  return target !== undefined && handle.elements[0].value === target;
}
export const nativeWriteAdapter: CompanyWriteAdapter = {
  tryWrite(handle, item) {
    if (!nativeOwnership(handle))
      return handle.owner === "native" ? fail : { handled: false };
    const o = authorized(handle, item),
      el = handle.elements[0];
    if (!o) return fail;
    if (o.field.search)
      return { handled: true, written: committedSearchMatches(handle, item) };
    if (o.field.driver)
      driverControls.set(
        handle,
        new Set(
          o.field.driver.dependencies.filter((name) => {
            const f = o.section.fields.find((f) => f.name === name)!;
            return (
              o.row.querySelector(
                `[name="${CSS.escape(rawNativeName(f.rawName, o.index))}"]`,
              ) !== null
            );
          }),
        ),
      );
    const kind = o.field.type,
      command =
        kind === "select"
          ? "SELECT_OPTION"
          : kind === "radio"
            ? "CHECK_RADIO"
            : "SET_TEXT";
    if (item.analysis?.writePlan?.command !== command) return fail;
    if (nativeValueMatches(handle, item))
      return { handled: true, written: true };
    if (kind === "select" || kind === "radio") {
      const option = selectedOption(o, handle, item.profileValue ?? "");
      if (!option) return fail;
      if (kind === "radio") {
        const checked = handle.elements.filter(
          (e) => (e as HTMLInputElement).checked,
        ) as HTMLInputElement[];
        if (
          checked.length &&
          !(
            checked.length === 1 &&
            checked[0].value === "" &&
            o.field.emptyRadioLabel &&
            text(checked[0].labels?.[0]?.textContent) ===
              o.field.emptyRadioLabel &&
            nativeSingleEntityAssigned(o, item.profileEntryId)
          )
        )
          return fail;
        // The click dispatches site handlers synchronously; only the selected group is adopted.
        (option as HTMLInputElement).click();
        if (
          !(option as HTMLInputElement).checked ||
          handle.elements.filter((e) => (e as HTMLInputElement).checked)
            .length !== 1
        )
          return fail;
        recordNativeRowWrite(o, handle.elements);
      } else {
        if (el.value !== "") return fail;
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )!.set!.call(el, option.value);
        recordNativeRowWrite(o, handle.elements);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      const target = nativeTarget(handle, item.profileValue ?? "");
      if (target === undefined || el.value !== "") return fail;
      el.focus();
      if (
        !authorized(handle, item) ||
        el.value !== "" ||
        nativeTarget(handle, item.profileValue ?? "") !== target
      )
        return fail;
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, target);
      recordNativeRowWrite(o, handle.elements);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    }
    return { handled: true, written: nativeValueMatches(handle, item) };
  },
  verifyRetained: (handle, item) =>
    nativeValueMatches(handle, item) &&
    (!nativeOwnership(handle)?.field.gpa || nativeGpaComplete(handle)),
};
export async function settleNativeDriver(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  signal: AbortSignal,
  current?: () => boolean,
): Promise<boolean> {
  const o = currentNativeOwner(handle),
    driver = o?.field.driver;
  if (!o || !driver || !nativeValueMatches(handle, item)) return false;
  const ready = () =>
    !signal.aborted &&
    current?.() !== false &&
    nativeValueMatches(handle, item) &&
    driver.settled
      .filter((r) => !r.whenLabel || r.whenLabel === item.profileValue)
      .every((r) => {
        const f = o.section.fields.find((f) => f.name === r.field)!;
        const found = Array.from(
          o.row.querySelectorAll(
            `[name="${CSS.escape(rawNativeName(f.rawName, o.index))}"]`,
          ),
        );
        if (found.length === 0 && !driverControls.get(handle)?.has(r.field))
          return true;
        return (
          found.length > 0 &&
          (f.type === "radio" || found.length === 1) &&
          found.every((e) =>
            r.state === "enabled"
              ? visible(e) && !("readOnly" in e && e.readOnly)
              : e.matches(":disabled") || !visible(e, true),
          )
        );
      });
  if (ready()) return true;
  const view = o.row.ownerDocument.defaultView!;
  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      view.clearTimeout(timer);
      view.clearInterval(poll);
      signal.removeEventListener("abort", finish);
      resolve(ready());
    };
    const check = () => {
      if (signal.aborted || current?.() === false || ready()) finish();
    };
    const observer = new view.MutationObserver(check),
      timer = view.setTimeout(finish, driver.timeoutMs),
      poll = view.setInterval(check, 20);
    signal.addEventListener("abort", finish, { once: true });
    observer.observe(o.row, {
      subtree: true,
      attributes: true,
      childList: true,
    });
  });
}
