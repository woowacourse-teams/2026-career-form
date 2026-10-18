import type { Profile } from "../../profile/model";
import type { FieldCandidateHandle } from "../dom/types";
import { resolveValueBinding } from "../profile/value-binding";
import {
  nativeOwnership,
  currentNativeOwner,
  rawNativeName,
  type NativeOwnership,
} from "./native-form-collection";
import type { NativeField } from "./native-form-contract";

type Approval = {
  score: HTMLInputElement;
  scale: HTMLSelectElement;
  scoreValue: string;
  scaleValue: string;
  option: HTMLOptionElement;
  digest: string;
  url: string;
};
const approvals = new WeakMap<Element, Approval>();
function pair(o: NativeOwnership) {
  const f = o.field,
    peer = o.section.fields.find((p) => p.name === f.gpa?.peer);
  if (!f.gpa || !peer) return;
  const scoreField = f.gpa.role === "SCORE" ? f : peer,
    scaleField = f.gpa.role === "SCALE" ? f : peer;
  const one = (field: NativeField) => {
    const all = o.row.querySelectorAll(
      `[name="${CSS.escape(rawNativeName(field.rawName, o.index))}"]`,
    );
    return all.length === 1 ? all[0] : undefined;
  };
  const prefix = rawNativeName(scoreField.rawName, o.index)
    .split(".")
    .slice(0, -1)
    .join(".");
  const score = one(scoreField),
    scale = one(scaleField);
  if (
    !(score instanceof HTMLInputElement) ||
    score.type !== "number" ||
    score.readOnly ||
    !(scale instanceof HTMLSelectElement) ||
    score.getAttribute("min") !== "0" ||
    score.getAttribute("step") !== "0.001" ||
    score.getAttribute("data-rel-id") !== scale.name ||
    score.getAttribute("data-rel-target") !==
      score.name.slice(0, score.name.lastIndexOf(".")) ||
    scale.getAttribute("data-rel-target") !== scale.name ||
    o.row.querySelector(
      `[name="${CSS.escape(`${prefix}.displayScore`)}"],[name="${CSS.escape(`${prefix}.displayPerfectScore`)}"]`,
    )
  )
    return;
  return { score, scale, scoreField, scaleField };
}
const decimal = (v: string) =>
  /^\d+(?:\.\d{1,3})?$/.test(v) && Number.isFinite(Number(v));
export function approveNativeGpa(
  handle: FieldCandidateHandle,
  profile: Profile,
  index: number,
): boolean {
  const o = nativeOwnership(handle);
  if (!o?.field.gpa) return true;
  const p = pair(o);
  if (!p) return false;
  const score = resolveValueBinding(profile, p.scoreField.binding, index),
    scale = resolveValueBinding(profile, p.scaleField.binding, index);
  if (score.status === "missing" && scale.status === "missing") return true;
  if (
    score.status !== "resolved" ||
    scale.status !== "resolved" ||
    !decimal(score.value) ||
    !decimal(scale.value) ||
    Number(scale.value) <= 0 ||
    Number(score.value) > Number(scale.value)
  )
    return false;
  const code = p.scaleField.options?.[scale.value];
  const options = Array.from(p.scale.options).filter(
    (e) => e.value === code || e.textContent?.trim() === scale.value,
  );
  if (
    !code ||
    options.length !== 1 ||
    options[0].value !== code ||
    options[0].textContent?.trim() !== scale.value ||
    options[0].disabled ||
    options[0].closest("optgroup:disabled")
  )
    return false;
  if (p.score.max && Number(score.value) > Number(p.score.max)) return false;
  approvals.set(o.row, {
    ...p,
    scoreValue: String(Number(score.value)),
    scaleValue: scale.value,
    option: options[0],
    digest: o.digest,
    url: o.url,
  });
  return true;
}
export function nativeGpaTarget(
  handle: FieldCandidateHandle,
  value: string,
): string | undefined {
  const o = currentNativeOwner(handle),
    a = o && approvals.get(o.row),
    p = o && pair(o);
  if (
    !o ||
    !a ||
    !p ||
    a.digest !== o.digest ||
    a.url !== o.url ||
    a.score !== p.score ||
    a.scale !== p.scale ||
    Array.from(a.scale.options).filter(
      (e) =>
        e.value === a.option.value || e.textContent?.trim() === a.scaleValue,
    ).length !== 1 ||
    !a.option.isConnected ||
    a.option.parentElement !== a.scale ||
    a.option.value !== p.scaleField.options?.[a.scaleValue] ||
    a.option.textContent?.trim() !== a.scaleValue ||
    a.option.disabled ||
    (p.score.max !== "" &&
      (!decimal(p.score.max) || Number(a.scoreValue) > Number(p.score.max))) ||
    (a.score.value !== "" && a.score.value !== a.scoreValue) ||
    (a.scale.value !== "" && a.scale.value !== a.option.value)
  )
    return;
  if (o.field.gpa?.role === "SCORE")
    return decimal(value) && String(Number(value)) === a.scoreValue
      ? a.scoreValue
      : undefined;
  return a.score.value === a.scoreValue && value === a.scaleValue
    ? a.scaleValue
    : undefined;
}
export function nativeGpaComplete(handle: FieldCandidateHandle): boolean {
  const o = currentNativeOwner(handle),
    a = o && approvals.get(o.row);
  return (
    !!a &&
    nativeGpaTarget(
      handle,
      o!.field.gpa!.role === "SCORE" ? a.scoreValue : a.scaleValue,
    ) !== undefined &&
    a.score.value === a.scoreValue &&
    a.scale.value === a.option.value
  );
}
