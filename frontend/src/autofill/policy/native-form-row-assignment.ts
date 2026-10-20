import { observedGradeLabel } from "./exam-grade-alias";
import { debugRuntimeSkip } from "../debug/structural-diagnostics";
import { approveNativeGpa } from "./native-form-gpa";
import { universityAdditionalMajors } from "../profile/university-additional-majors";
import {
  captureNativeNestedRows,
  nativeNestedRows,
  nativeNestedPreparationCurrent,
} from "./native-form-nested";
import type { Profile, ProfileEntry } from "../../profile/model";
import type { FieldCandidateHandle } from "../dom/types";
import { resolveValueBinding } from "../profile/value-binding";
import { formatProfileDate } from "../profile/date-format";
import { standardValueLabel } from "../../profile/standard-values";
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
  physicalIndex: number;
  children?: Element[];
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
  if (
    field.type === "select" &&
    field.dynamicOptions?.codeFormat === "OBSERVED"
  ) {
    const select = row.querySelector<HTMLSelectElement>(
      `select[name="${CSS.escape(rawNativeName(field.rawName, physicalIndex))}"]`,
    );
    return observedGradeLabel(
      resolved.value,
      select ? Array.from(select.options, (o) => text(o.textContent)) : [],
    );
  }
  // Option fields hold the standard label (주간) for a DIRECT standard token (attendance:day).
  if (!field.date)
    return field.options && field.binding.type === "DIRECT"
      ? (standardValueLabel(resolved.value) ?? resolved.value)
      : resolved.value;
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
/** Row-gating selects whose catalog varies by tenant (careerhyundai offers
 * seven employment types, gsenc·abl nine). */
const catalogDrivers = (section: NativeSection) =>
  section.fields.filter(
    (f) =>
      f.driver &&
      f.type === "select" &&
      f.dynamicOptions?.codeFormat === "POSITIVE_INTEGER" &&
      !f.search &&
      f.nestedIndex === undefined,
  );
/**
 * Profile entries whose row driver label no non-placeholder option on the
 * page carries (the same test as `nativeOptionPresence` "absent"). With no
 * rendered row there is no catalog to read, so nothing is excluded.
 */
function unofferedEntries(
  section: NativeSection,
  rows: readonly Element[],
  profile: Profile,
  count: number,
): Set<number> {
  const unoffered = new Set<number>();
  for (const field of catalogDrivers(section)) {
    const selects = rows.flatMap((row, i) =>
      Array.from(
        row.querySelectorAll<HTMLSelectElement>(
          `select[name="${CSS.escape(rawNativeName(field.rawName, i))}"]`,
        ),
      ),
    );
    if (!selects.length) continue;
    const offered = new Set(
      selects.flatMap((select) =>
        Array.from(select.options)
          .filter((o) => o.value !== "")
          .map((o) => text(o.textContent)),
      ),
    );
    for (let index = 0; index < count; index++) {
      const resolved = resolveValueBinding(profile, field.binding, index);
      if (resolved.status === "resolved" && !offered.has(resolved.value))
        unoffered.add(index);
    }
  }
  return unoffered;
}
/** Why an existing row is left alone and, when its identity matched, which profile entry it holds. */
interface ExistingRow {
  reason: string;
  index?: number;
}
/** A retained value equals the profile value; a numeric grade compares as a number (3.65 = 3.650). */
function sameRetainedValue(
  field: NativeField,
  value: string | undefined,
  expected: string | undefined,
): boolean {
  if (value === undefined || expected === undefined) return false;
  if (value === expected) return true;
  return (
    !!field.gpa &&
    /^\d+(\.\d+)?$/.test(value) &&
    /^\d+(\.\d+)?$/.test(expected) &&
    Number(value) === Number(expected)
  );
}
/** Each bail cause is logged once per document and section. */
const diagnosed = new WeakMap<Document, Set<string>>();
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
  const bail = (cause: string) => {
    const seen = diagnosed.get(document) ?? new Set<string>();
    diagnosed.set(document, seen);
    if (!seen.has(`${section.id}:${cause}`)) {
      seen.add(`${section.id}:${cause}`);
      debugRuntimeSkip(
        section.id,
        "row-identity",
        `native-row-assignment:${cause}`,
        "prepare",
      );
    }
    return null;
  };
  if (roots.length !== 1) return bail("section-root");
  const root = roots[0],
    rows = nativeRows(root, section);
  if (!rows) return bail("row-contract");
  const entries = (profile[action.categoryId] as ProfileEntry[]).filter(
    (e) => e.sectionId === action.profileSectionId,
  );
  const profileDigest = JSON.stringify(entries),
    digest = JSON.stringify(form),
    used = new Set<number>(),
    result = new Map<Element, number>(),
    existing = new Map<Element, ExistingRow>(),
    blank: Element[] = [];
  let occupied = 0;
  for (const [physicalIndex, row] of rows.entries()) {
    const previous = assigned.get(row),
      o = ownership(document, section, root, row, physicalIndex);
    if (previous?.children) {
      const children = nativeNestedRows(row, section, physicalIndex);
      if (
        !children ||
        previous.children.some((child, i) => children[i] !== child) ||
        (children.length > previous.children.length &&
          !nativeNestedPreparationCurrent(row, rows))
      )
        return bail("nested-rows-changed");
      previous.children = [...children];
    }
    if (
      previous &&
      previous.physicalIndex === physicalIndex &&
      previous.profile === profileDigest &&
      previous.digest === digest &&
      previous.url === document.URL &&
      entries[previous.index]?.id === previous.entryId &&
      (nativeRowBlank(row) || nativeRowHasWrites(o))
    ) {
      if (used.has(previous.index)) return bail("entry-reused");
      used.add(previous.index);
      result.set(row, previous.index);
    }
  }
  // Prior assignments reserve profile entries before any existing row is matched.
  for (const [physicalIndex, row] of rows.entries()) {
    if (result.has(row)) continue;
    if (nativeRowBlank(row)) {
      blank.push(row);
      continue;
    }
    occupied++;
    existing.set(row, {
      reason: "기존 입력 행은 보존하며 사용자 확인이 필요합니다.",
    });
    const excluded = section.fields.some((f) =>
      excludedSearchRow(row, f, physicalIndex),
    );
    const identity = section.identityFields.map((name) =>
      section.fields.find((f) => f.name === name)!,
    );
    if (identity.some((f) => fieldValue(row, f, physicalIndex) === undefined))
      return bail("identity-unreadable");
    const matches = entries.flatMap((_, index) =>
      identity.every(
        (f) =>
          fieldValue(row, f, physicalIndex) ===
          profileValue(profile, f, index, row, physicalIndex),
      )
        ? [index]
        : [],
    );
    if (matches.length > 1 || matches.some((i) => used.has(i)))
      return bail("identity-ambiguous");
    // A populated row that differs from an entry in exactly one identity field
    // is most likely that entry after the site normalized a value (a reformatted
    // date, a suffixed school name). Adding another row would duplicate it, so
    // the section goes to the user like any other conflicting existing row.
    if (
      !matches.length &&
      identity.length > 1 &&
      entries.some(
        (_, index) =>
          !used.has(index) &&
          identity.filter(
            (f) =>
              fieldValue(row, f, physicalIndex) ===
              profileValue(profile, f, index, row, physicalIndex),
          ).length ===
            identity.length - 1,
      )
    )
      return bail("identity-near-match");
    if (matches.length === 1) {
      const index = matches[0];
      if (
        !excluded &&
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
            !sameRetainedValue(
              f,
              value,
              profileValue(profile, f, index, row, physicalIndex),
            )
          );
        })
      )
        return bail("existing-value-conflict");
      used.add(index);
      existing.set(row, {
        reason: "이미 입력된 항목입니다. 기존 행은 수정하지 않습니다.",
        index,
      });
    }
  }
  // An entry the tenant's catalog cannot express never gets an added row: it
  // only takes a blank row the page already has, after the offered entries.
  const unoffered = unofferedEntries(section, rows, profile, entries.length);
  const remaining = entries.map((_, i) => i).filter((i) => !used.has(i));
  const offered = remaining.filter((i) => !unoffered.has(i));
  const order = [...offered, ...remaining.filter((i) => unoffered.has(i))];
  const required = occupied + result.size + offered.length;
  if (required > section.rows.maxCount) return bail("row-limit");
  const unplaced = order.slice(blank.length).filter((i) => unoffered.has(i));
  blank.forEach((row, i) => {
    const index = order[i];
    if (index !== undefined) {
      result.set(row, index);
      assigned.set(row, {
        profile: profileDigest,
        digest,
        url: document.URL,
        entryId: entries[index].id,
        index,
        physicalIndex: rows.indexOf(row),
        children: nativeNestedRows(row, section, rows.indexOf(row)),
      });
    }
  });
  return { result, required, existing, root, rows, unplaced };
}
export function nativeRepeatableProfileCount(
  document: Document,
  id: string | undefined,
  profile: Profile,
): number | null | undefined {
  const nested = nativeForm(document)?.sections.find(
    (s) => s.nested && id?.startsWith(s.nested.action.idPrefix),
  );
  if (nested) {
    const suffix = id!.slice(nested.nested!.action.idPrefix.length);
    if (!/^(0|[1-9][0-9]*)$/.test(suffix)) return null;
    const state = assignments(document, nested, profile),
      physical = Number(suffix),
      parent = state?.rows[physical];
    if (!state || !parent) return null;
    const index = state.result.get(parent);
    if (index === undefined) return null;
    const entry = profile.education.filter(
      (e) => e.sectionId === nested.action!.profileSectionId,
    )[index];
    const majors = entry && universityAdditionalMajors(entry.values);
    if (
      !entry?.values.majorName?.trim() ||
      !majors ||
      new Set([entry.values.majorName.trim(), ...majors.map((m) => m.name)])
        .size !==
        majors.length + 1 ||
      !nativeNestedRows(parent, nested, physical) ||
      !captureNativeNestedRows(state.root, state.rows, parent, nested, physical)
    )
      return null;
    return 1 + majors.length;
  }
  const section = nativeForm(document)?.sections.find(
    (s) => s.action?.id === id,
  );
  if (!section?.identityFields) return;
  const state = assignments(document, section, profile);
  if (state) captureNativePreparationRows(state.root, state.rows);
  return state?.required ?? null;
}
/** A profile entry left without a row because the tenant does not offer its
 * row driver label; the review reports it instead of adding a row. */
export interface NativeUnofferedEntry {
  field: NativeField;
  index: number;
  entryId: string;
  value: string;
}
export function nativeUnofferedEntries(
  document: Document,
  section: NativeSection,
  profile: Profile,
): NativeUnofferedEntry[] {
  if (!section.enabled || section.singleEntity || !section.identityFields)
    return [];
  const field = catalogDrivers(section)[0];
  const state = field && assignments(document, section, profile);
  if (!state) return [];
  return state.unplaced.flatMap((index) => {
    const resolved = resolveValueBinding(profile, field.binding, index);
    return resolved.status === "resolved" && resolved.profileEntryId
      ? [
          {
            field,
            index,
            entryId: resolved.profileEntryId,
            value: resolved.value,
          },
        ]
      : [];
  });
}
const QUALIFICATION_REASON =
  "입력 불가(검정고시 학력 — 사용자 처리): 검정고시 학력은 지원서에서 직접 선택해 주세요.";
function singleEntityAssignment(
  o: NativeOwnership,
  profile: Profile,
): number | ExistingRow {
  const field = o.section.fields.find(
    (f) => f.name === o.section.identityFields?.[0],
  )!;
  const [category, section] = (field.binding.profileFieldKey ?? "").split(".");
  const source = profile[category as keyof Profile];
  const entries = Array.isArray(source)
    ? (source as ProfileEntry[]).filter((e) => e.sectionId === section)
    : [];
  const blocked = {
    reason: "입력 불가(기존 값 — 사용자 처리): 학교 신원을 확인해 주세요.",
  };
  if (entries.length === 0)
    return {
      reason: "프로필 항목 없음: 해당 학력 항목을 등록하지 않았습니다.",
    };
  if (entries.length !== 1) return blocked;
  // The policy leaves the site's 검정고시 graduation out on purpose: a
  // qualification-exam profile must never be checked as 졸업 (H4).
  if (entries[0].values.academicProcess === "대입 검정고시")
    return { reason: QUALIFICATION_REASON };
  const profileDigest = JSON.stringify(entries),
    previous = assigned.get(o.row);
  if (
    previous?.profile === profileDigest &&
    previous.digest === o.digest &&
    previous.url === o.url &&
    previous.entryId === entries[0].id &&
    (nativeRowBlank(o.row) || nativeRowHasWrites(o))
  )
    return 0;
  if (nativeRowBlank(o.row)) {
    assigned.set(o.row, {
      profile: profileDigest,
      digest: o.digest,
      url: o.url,
      entryId: entries[0].id,
      index: 0,
      physicalIndex: 0,
    });
    return 0;
  }
  const expected = resolveValueBinding(profile, field.binding, 0);
  return expected.status === "resolved" &&
    fieldValue(o.row, field, 0) === expected.value
    ? {
        reason: "이미 입력된 항목입니다. 기존 엔티티는 수정하지 않습니다.",
        index: 0,
      }
    : blocked;
}
export function nativeProfileAssignment(
  handle: FieldCandidateHandle,
  profile: Profile,
): number | ExistingRow | undefined {
  const o = nativeOwnership(handle);
  if (!o?.section.identityFields) return;
  if (o.section.singleEntity) return singleEntityAssignment(o, profile);
  const state = assignments(o.row.ownerDocument, o.section, profile);
  const index = state?.result.get(o.row);
  if (index !== undefined && o.field.nestedIndex !== undefined) {
    const entry = profile.education.filter(
      (e) => e.sectionId === o.section.action!.profileSectionId,
    )[index];
    const majors = entry && universityAdditionalMajors(entry.values);
    if (
      !entry?.values.majorName?.trim() ||
      !majors ||
      new Set([entry.values.majorName.trim(), ...majors.map((m) => m.name)])
        .size !==
        majors.length + 1 ||
      o.field.nestedIndex > majors.length
    )
      return {
        reason: "전공 역할과 프로필 이름을 유일하게 연결할 수 없습니다.",
      };
  }
  if (index !== undefined && !approveNativeGpa(handle, profile, index))
    return { reason: "숫자 평점과 만점기준을 함께 확인해 주세요." };
  return (
    index ??
    state?.existing.get(o.row) ?? {
      reason: "행 신원을 확인할 수 없어 해당 섹션은 사용자 확인이 필요합니다.",
    }
  );
}

/** Only a review assigned to one actual profile entry may replace an empty default. */
export function nativeSingleEntityAssigned(
  o: NativeOwnership,
  entryId: string | undefined,
): boolean {
  const previous = assigned.get(o.row);
  return (
    !!o.section.singleEntity &&
    !!entryId &&
    previous?.entryId === entryId &&
    previous.digest === o.digest &&
    previous.url === o.url
  );
}
