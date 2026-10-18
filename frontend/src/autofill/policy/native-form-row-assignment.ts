import type { Profile, ProfileEntry } from "../../profile/model";
import type { FieldCandidateHandle } from "../dom/types";
import { resolveValueBinding } from "../profile/value-binding";
import { formatProfileDate } from "../profile/date-format";
import {
  nativeForm,
  nativeDocument,
  nativeRows,
  nativeOwnership,
  rawNativeName,
  type NativeOwnership,
} from "./native-form-collection";
import type { NativeField, NativeSection } from "./native-form-contract";
import {
  captureNativePreparationRows,
  nativeControlValue,
  nativeRowBlank,
  nativeRowHasWrites,
} from "./native-form-row-state";
import {
  searchNodes,
  searchTuple,
  excludedSearchRow,
} from "./native-form-search-dom";
import { text } from "./primitives";

type Assignment = {
  profile: string;
  digest: string;
  url: string;
  entryId: string;
  index: number;
};
const assigned = new WeakMap<Element, Assignment>();
function fieldValue(
  row: Element,
  field: NativeField,
  index: number,
): string | undefined {
  if (field.search) {
    const nodes = searchNodes(row, field, index);
    if (!nodes) return;
    const [name, code, display] = searchTuple(nodes);
    return name &&
      name === display &&
      /^[A-Za-z0-9_-]{1,64}$/.test(code) &&
      !/^0+$/.test(code)
      ? name
      : undefined;
  }
  const controls = Array.from(
    row.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[name="${CSS.escape(rawNativeName(field.rawName, index))}"]`),
  );
  if (field.type === "radio") {
    const checked = controls.filter(
      (e) => e instanceof HTMLInputElement && e.checked,
    ) as HTMLInputElement[];
    if (checked.length !== 1) return;
    const label = text(checked[0].labels?.[0]?.textContent);
    return field.options?.[label] === checked[0].value ? label : undefined;
  }
  if (controls.length !== 1 || !nativeControlValue(controls[0])) return;
  const e = controls[0];
  if (e instanceof HTMLSelectElement) {
    const label = text(e.selectedOptions[0]?.textContent);
    return field.options?.[label] === e.value ||
      (field.dynamicOptions &&
        (field.dynamicOptions.codeFormat === "OBSERVED" ||
          field.dynamicOptions.labels.includes(label)))
      ? label
      : undefined;
  }
  return e.value;
}
function profileValue(
  profile: Profile,
  field: NativeField,
  index: number,
  row: Element,
  physicalIndex: number,
): string | undefined {
  const resolved = resolveValueBinding(profile, field.binding, index);
  if (resolved.status !== "resolved") return;
  if (!field.date) return resolved.value;
  const source =
    field.date.role === "END"
      ? row.querySelector<HTMLInputElement>(
          `[data-dates^="${CSS.escape(rawNativeName(field.date.group, physicalIndex))}:"]:not([data-dates*="END"])`,
        )
      : row.querySelector<HTMLInputElement>(
          `[name="${CSS.escape(rawNativeName(field.rawName, physicalIndex))}"]`,
        );
  const token = source?.getAttribute("data-dates")?.split(/\s+/)[0];
  const precision = token?.split(":").at(-1);
  if (!field.date.formats.includes(precision as "YM" | "YMD")) return;
  const formatted = formatProfileDate(
    resolved.value,
    precision === "YM" ? "YYYY.MM" : "YYYY.MM.DD",
  );
  return formatted.status === "resolved" ? formatted.value : undefined;
}
function ownership(
  document: Document,
  section: NativeSection,
  root: Element,
  row: Element,
  index: number,
): NativeOwnership {
  const form = nativeForm(document)!;
  return {
    form,
    section,
    root,
    row,
    index,
    field: section.fields[0],
    observedOptions: [],
    digest: JSON.stringify(form),
    url: document.URL,
  };
}
function assignments(
  document: Document,
  section: NativeSection,
  profile: Profile,
) {
  const form = nativeForm(document),
    action = section.action;
  if (
    !form ||
    !nativeDocument(document, form) ||
    !section.rows ||
    !action ||
    !section.identityFields
  )
    return;
  const roots = Array.from(document.querySelectorAll(section.selector)).filter(
    (e) => document.querySelector(form.rootSelector)?.contains(e),
  );
  if (roots.length !== 1) return null;
  const root = roots[0],
    rows = nativeRows(root, section);
  if (!rows) return null;
  const entries = (profile[action.categoryId] as ProfileEntry[]).filter(
    (e) => e.sectionId === action.profileSectionId,
  );
  const profileDigest = JSON.stringify(entries),
    digest = JSON.stringify(form),
    used = new Set<number>(),
    result = new Map<Element, number>(),
    existing = new Map<Element, string>(),
    blank: Element[] = [];
  let occupied = 0;
  for (const [physicalIndex, row] of rows.entries()) {
    const previous = assigned.get(row),
      o = ownership(document, section, root, row, physicalIndex);
    if (
      previous &&
      previous.profile === profileDigest &&
      previous.digest === digest &&
      previous.url === document.URL &&
      entries[previous.index]?.id === previous.entryId &&
      (nativeRowBlank(row) || nativeRowHasWrites(o))
    ) {
      used.add(previous.index);
      result.set(row, previous.index);
      continue;
    }
    if (nativeRowBlank(row)) {
      blank.push(row);
      continue;
    }
    occupied++;
    existing.set(row, "기존 입력 행은 보존하며 사용자 확인이 필요합니다.");
    if (section.fields.some((f) => excludedSearchRow(row, f, physicalIndex)))
      continue;
    const identity = section.identityFields.map((name) =>
      section.fields.find((f) => f.name === name)!,
    );
    if (identity.some((f) => fieldValue(row, f, physicalIndex) === undefined))
      return null;
    const matches = entries.flatMap((_, index) =>
      identity.every(
        (f) =>
          fieldValue(row, f, physicalIndex) ===
          profileValue(profile, f, index, row, physicalIndex),
      )
        ? [index]
        : [],
    );
    if (matches.length > 1 || matches.some((i) => used.has(i))) return null;
    if (matches.length === 1) {
      const index = matches[0];
      if (
        section.fields.some((f) => {
          const value = fieldValue(row, f, physicalIndex);
          const populated = Array.from(
            row.querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >(
              `[name="${CSS.escape(rawNativeName(f.rawName, physicalIndex))}"]`,
            ),
          ).some((e) => nativeControlValue(e) !== "");
          return (
            populated &&
            (value === undefined ||
              value !== profileValue(profile, f, index, row, physicalIndex))
          );
        })
      )
        return null;
      used.add(index);
      existing.set(row, "이미 입력된 항목입니다. 기존 행은 수정하지 않습니다.");
    }
  }
  const remaining = entries.map((_, i) => i).filter((i) => !used.has(i));
  const required = occupied + result.size + remaining.length;
  if (required > section.rows.maxCount) return null;
  blank.forEach((row, i) => {
    const index = remaining[i];
    if (index !== undefined) {
      result.set(row, index);
      assigned.set(row, {
        profile: profileDigest,
        digest,
        url: document.URL,
        entryId: entries[index].id,
        index,
      });
    }
  });
  return { result, required, existing, root, rows };
}
export function nativeRepeatableProfileCount(
  document: Document,
  id: string | undefined,
  profile: Profile,
): number | null | undefined {
  const section = nativeForm(document)?.sections.find(
    (s) => s.action?.id === id,
  );
  if (!section?.identityFields) return;
  const state = assignments(document, section, profile);
  if (state) captureNativePreparationRows(state.root, state.rows);
  return state?.required ?? null;
}
export function nativeProfileAssignment(
  handle: FieldCandidateHandle,
  profile: Profile,
): number | { reason: string } | undefined {
  const o = nativeOwnership(handle);
  if (!o?.section.identityFields) return;
  const state = assignments(o.row.ownerDocument, o.section, profile);
  return (
    state?.result.get(o.row) ?? {
      reason:
        state?.existing.get(o.row) ??
        "행 신원을 확인할 수 없어 해당 섹션은 사용자 확인이 필요합니다.",
    }
  );
}
