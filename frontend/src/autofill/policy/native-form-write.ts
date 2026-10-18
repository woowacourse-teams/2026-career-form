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
  const f = o.field;
  if (f.date) {
    if (!(el instanceof HTMLInputElement) || el.type !== "text") return;
    const peer = peerControl(o, f.date.peer),
      group = rawNativeName(f.date.group, o.index);
    if (!peer) return;
    const start = f.date.role === "START" ? el : peer;
    const tokens = start.getAttribute("data-dates")?.split(/\s+/) ?? [];
    const precision = tokens[0]?.slice(group.length + 1);
    if (
      tokens[0] !== `${group}:${precision}` ||
      !f.date.formats.includes(precision as "YM" | "YMD") ||
      tokens.slice(1).some((t) => t !== "forbiddenAfterToday") ||
      tokens.includes("forbiddenAfterToday") !== f.date.forbiddenAfterToday
    )
      return;
    const end = f.date.role === "END" ? el : peer;
    if (
      end.getAttribute("data-dates") !==
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
    if (peer.value) {
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
    !item.selected ||
    item.disabled ||
    item.candidateId !== handle.candidateId ||
    item.analysis?.candidateId !== handle.candidateId ||
    item.analysis.mappingStatus !== "ADAPTER_VERIFIED" ||
    item.analysis.interactionStatus !== "READY" ||
    JSON.stringify(item.analysis.valueBinding) !==
      JSON.stringify(o.field.binding) ||
    /(?:^|\.)existYn$/.test(o.field.rawName) ||
    handle.elements.some((e) => !visible(e) || ("readOnly" in e && e.readOnly))
  )
    return;
  return o;
}
function selectedOption(
  o: NativeOwnership,
  handle: FieldCandidateHandle,
  label: string,
): HTMLOptionElement | HTMLInputElement | undefined {
  const dynamic = o.field.dynamicOptions;
  const observed = o.observedOptions.filter((opt) => opt.label === label);
  const code =
    dynamic &&
    dynamic.labels.includes(label) &&
    observed.length === 1 &&
    /^[1-9][0-9]{0,11}$/.test(observed[0].code)
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
        if (handle.elements.some((e) => (e as HTMLInputElement).checked))
          return fail;
        (option as HTMLInputElement).click();
      } else {
        if (el.value !== "") return fail;
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )!.set!.call(el, option.value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      const target = nativeTarget(handle, item.profileValue ?? "");
      if (target === undefined || el.value !== "") return fail;
      el.focus();
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, target);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    }
    return { handled: true, written: nativeValueMatches(handle, item) };
  },
  verifyRetained: nativeValueMatches,
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
