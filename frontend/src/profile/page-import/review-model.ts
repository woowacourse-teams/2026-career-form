import { formatProfileDate } from "../../autofill/profile/date-format";
import type { ProfileFieldDefinition } from "../field-definitions";
import type {
  FieldValues,
  Profile,
  ProfileCategoryId,
  ProfileEntry,
  RepeatedProfileCategoryId,
  SingleProfileCategoryId,
} from "../model";
import { IMPORT_ENTRY_KEYS, type ImportSelection } from "./merge";
import { initialNameParts } from "./NameSplitEditor";
import type { ImportCandidate } from "./reader";
import {
  destination,
  fieldLabel,
  groupKey,
  NAME_GROUPS,
} from "./review-fields";
import { findInvalidImportRows } from "./review-selection";

export type ReviewStatus = "new" | "changed" | "same" | "pending" | "excluded";
export type PendingReason = "name" | "date" | "target";
export interface NameDecision {
  familyName: string;
  givenName: string;
  confirmed: boolean;
}
export interface ReviewDecisions {
  /** Keyed by NAME_GROUPS source. */
  names: Readonly<Record<string, NameDecision>>;
  /** Keyed by candidate source; null drops only that date. */
  dates: Readonly<Record<string, string | null>>;
  /** Keyed by groupKey: "new", "skip" or `existing:<entry id>`. */
  targets: Readonly<Record<string, string>>;
}
export interface ReviewRow {
  /** Selection key: candidate source, or the personal field ID for names. */
  key: string;
  source: string;
  categoryId: ProfileCategoryId;
  fieldId: string;
  label: string;
  value: string;
  current: string;
  status: ReviewStatus;
  pending?: PendingReason;
  sensitive: boolean;
  primary: boolean;
  groupKey?: string;
  groupLabel?: string;
  sectionId?: string;
  rowIndex?: number;
  /** Set when a repeated row explicitly updates an existing entry. */
  targetId?: string;
  /** Absent for name parts, which have no profile field definition. */
  field?: ProfileFieldDefinition;
}
export type Confirmation =
  | {
      kind: "name";
      id: string;
      source: string;
      value: string;
      language: "korean" | "english";
    }
  | {
      kind: "date";
      id: string;
      source: string;
      label: string;
      /** YYYY-MM when the page gave a month; otherwise a full date is asked. */
      month?: string;
    }
  | {
      kind: "target";
      id: string;
      source: string;
      name?: string;
      primary: string;
      /** Values this application row would save, for side-by-side comparison. */
      fields: readonly { fieldId: string; label: string; value: string }[];
      entries: readonly ProfileEntry[];
    };
export interface ReviewModel {
  rows: readonly ReviewRow[];
  confirmations: readonly Confirmation[];
}

const NEW = "new";
const SKIP = "skip";
const EXISTING = "existing:";

/** Category and section labels use "A·B"; the import screen reads "A와 B". */
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  "주·야간": "주야간",
};

export function plainLabel(label: string): string {
  const override = LABEL_OVERRIDES[label];
  if (override) return override;
  return label.replace(/\s*·\s*/gu, (_match, offset: number, whole: string) => {
    const code = whole.charCodeAt(offset - 1) - 0xac00;
    const batchim = code >= 0 && code < 11172 && code % 28 !== 0;
    return batchim ? "과 " : "와 ";
  });
}

const usable = (candidate: ImportCandidate) =>
  candidate.status !== "unsupported" && Boolean(candidate.value);

const languageOf = (source: string) =>
  source === "basicInformation.name" ? "korean" : "english";

export function initialDecisions(
  candidates: readonly ImportCandidate[],
): ReviewDecisions {
  const names: Record<string, NameDecision> = {};
  for (const group of NAME_GROUPS) {
    const candidate = candidates.find(
      (c) => c.source === group.source && usable(c),
    );
    if (!candidate?.value) continue;
    const parts = initialNameParts(candidate.value, languageOf(group.source));
    names[group.source] = { ...parts, confirmed: false };
  }
  return { names, dates: {}, targets: {} };
}

function statusOf(
  value: string,
  current: string,
  pending?: PendingReason,
  excluded = false,
): ReviewStatus {
  if (excluded) return "excluded";
  if (pending) return "pending";
  if (value === current) return "same";
  return current ? "changed" : "new";
}

function nameRows(
  candidates: readonly ImportCandidate[],
  baseline: Profile,
  decisions: ReviewDecisions,
): ReviewRow[] {
  return NAME_GROUPS.flatMap((group) => {
    const decision = decisions.names[group.source];
    if (
      !decision ||
      !candidates.some((c) => c.source === group.source && usable(c))
    )
      return [];
    return group.keys.map(([key, label], index) => {
      const value = (index ? decision.givenName : decision.familyName).trim();
      const current = baseline.personal[key] ?? "";
      const pending = decision.confirmed ? undefined : "name";
      return {
        key,
        source: group.source,
        categoryId: "personal" as const,
        fieldId: key,
        label,
        value,
        current,
        status: statusOf(value, current, pending, !pending && !value),
        pending,
        sensitive: false,
        primary: false,
      };
    });
  });
}

interface RowTarget {
  value: string;
  name?: string;
  primary: string;
  entries: readonly ProfileEntry[];
  entry?: ProfileEntry;
}

function rowTarget(
  candidate: ImportCandidate,
  fields: readonly ImportCandidate[],
  baseline: Profile,
  decisions: ReviewDecisions,
): RowTarget {
  const { category, section } = destination(candidate)!;
  const key = groupKey(candidate);
  const primary = IMPORT_ENTRY_KEYS[section.id]?.[0] ?? "";
  const name = fields
    .find((c) => groupKey(c) === key && destination(c)!.field.id === primary)
    ?.value?.trim();
  const entries = baseline[category.id as RepeatedProfileCategoryId].filter(
    (entry) => entry.sectionId === section.id,
  );
  const duplicate = entries.some((e) => e.values[primary]?.trim() === name);
  const value = decisions.targets[key] ?? (name && !duplicate ? NEW : "");
  const entry = entries.find((e) => `${EXISTING}${e.id}` === value);
  return { value, name, primary, entries, entry };
}

function dateValue(
  candidate: ImportCandidate,
  decisions: ReviewDecisions,
): { value: string; pending?: PendingReason; excluded: boolean } {
  const decided = decisions.dates[candidate.source];
  if (decided === null) return { value: candidate.value!, excluded: true };
  if (typeof decided === "string") return { value: decided, excluded: false };
  if (candidate.precision === "day")
    return { value: candidate.value!, excluded: false };
  return { value: candidate.value!, pending: "date", excluded: false };
}

function fieldRow(
  candidate: ImportCandidate,
  fields: readonly ImportCandidate[],
  baseline: Profile,
  decisions: ReviewDecisions,
): ReviewRow {
  const { category, section, field } = destination(candidate)!;
  const date =
    field.inputType === "date"
      ? dateValue(candidate, decisions)
      : { value: candidate.value!, excluded: false };
  const base = {
    key: candidate.source,
    source: candidate.source,
    categoryId: category.id,
    fieldId: field.id,
    label: plainLabel(
      category.repeatable ? field.label : fieldLabel(candidate),
    ),
    value: date.value,
    sensitive: category.sensitive,
    field,
  };
  if (!category.repeatable) {
    const current =
      baseline[category.id as SingleProfileCategoryId][field.id] ?? "";
    return {
      ...base,
      current,
      status: statusOf(date.value, current, date.pending, date.excluded),
      pending: date.pending,
      primary: false,
    };
  }
  const target = rowTarget(candidate, fields, baseline, decisions);
  const pending = target.value ? date.pending : "target";
  const excluded =
    target.value === SKIP || (date.excluded && pending !== "target");
  const current = target.entry?.values[field.id] ?? "";
  return {
    ...base,
    current,
    status: statusOf(date.value, current, pending, excluded),
    pending: excluded ? undefined : pending,
    primary: field.id === target.primary,
    groupKey: groupKey(candidate),
    groupLabel: plainLabel(`${section.label} ${candidate.rowIndex! + 1}`),
    sectionId: section.id,
    rowIndex: candidate.rowIndex,
    targetId: target.entry?.id,
  };
}

function confirmationsFor(
  rows: readonly ReviewRow[],
  candidates: readonly ImportCandidate[],
  fields: readonly ImportCandidate[],
  baseline: Profile,
  decisions: ReviewDecisions,
): Confirmation[] {
  const result: Confirmation[] = [];
  for (const group of NAME_GROUPS) {
    const candidate = candidates.find(
      (c) => c.source === group.source && usable(c),
    );
    if (candidate && !decisions.names[group.source]?.confirmed)
      result.push({
        kind: "name",
        id: group.source,
        source: group.source,
        value: candidate.value!,
        language: languageOf(group.source),
      });
  }
  const asked = new Set<string>();
  for (const row of rows) {
    if (row.pending === "target" && !asked.has(row.groupKey!)) {
      asked.add(row.groupKey!);
      const candidate = fields.find((c) => c.source === row.source)!;
      const target = rowTarget(candidate, fields, baseline, decisions);
      result.push({
        kind: "target",
        id: row.groupKey!,
        source: row.source,
        name: target.name,
        primary: target.primary,
        fields: rows
          .filter((r) => r.groupKey === row.groupKey)
          .map(({ fieldId, label, value }) => ({ fieldId, label, value })),
        entries: target.entries,
      });
    }
  }
  for (const row of rows)
    if (row.pending === "date")
      result.push({
        kind: "date",
        id: row.source,
        source: row.source,
        label: row.groupLabel ? `${row.groupLabel} ${row.label}` : row.label,
        month: /^\d{4}-\d{2}$/u.test(row.value) ? row.value : undefined,
      });
  return result;
}

export function buildReviewModel(
  candidates: readonly ImportCandidate[],
  baseline: Profile,
  decisions: ReviewDecisions,
): ReviewModel {
  const fields = candidates.filter((c) => usable(c) && destination(c));
  const rows = [
    ...nameRows(candidates, baseline, decisions),
    ...fields.map((c) => fieldRow(c, fields, baseline, decisions)),
  ];
  return {
    rows,
    confirmations: confirmationsFor(
      rows,
      candidates,
      fields,
      baseline,
      decisions,
    ),
  };
}

export const isSelectable = (row: ReviewRow) =>
  row.status === "new" || row.status === "changed";

export function defaultSelection(
  rows: readonly ReviewRow[],
): Record<string, boolean> {
  return Object.fromEntries(
    rows
      .filter((r) => r.status === "new" && !r.sensitive)
      .map((r) => [r.key, true]),
  );
}

function existingValues(row: ReviewRow, baseline: Profile): FieldValues {
  if (!row.groupKey)
    return { ...baseline[row.categoryId as SingleProfileCategoryId] };
  const entries = baseline[row.categoryId as RepeatedProfileCategoryId];
  return { ...entries.find((e) => e.id === row.targetId)?.values };
}

/** Same option and conditional-visibility checks the profile editor enforces. */
function ready(
  row: ReviewRow,
  rows: readonly ReviewRow[],
  selected: Readonly<Record<string, boolean>>,
  baseline: Profile,
): boolean {
  if (!isSelectable(row) || !row.value.trim()) return false;
  const candidateField = row.field;
  if (!candidateField) return true;
  if (
    candidateField.inputType === "date" &&
    formatProfileDate(row.value, "YYYY-MM-DD").status !== "resolved"
  )
    return false;
  const combined = existingValues(row, baseline);
  for (const other of rows)
    if (
      other.categoryId === row.categoryId &&
      other.groupKey === row.groupKey &&
      selected[other.key]
    )
      combined[other.fieldId] = other.value;
  combined[row.fieldId] = row.value;
  if (candidateField.visibleWhen && !candidateField.visibleWhen(combined))
    return false;
  const options =
    candidateField.optionsFor?.(combined) ?? candidateField.options;
  return (
    !options ||
    options.some(
      (option) =>
        (typeof option === "string" ? option : option.value) === row.value,
    )
  );
}

export function effectiveSelection(
  model: ReviewModel,
  selected: Readonly<Record<string, boolean>>,
  baseline: Profile,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const row of model.rows)
    if (selected[row.key] && ready(row, model.rows, selected, baseline))
      result[row.key] = true;
  for (const row of model.rows)
    if (row.groupKey && !row.targetId && row.primary && !result[row.key])
      dropGroup(result, model.rows, row.groupKey);
  for (const row of model.rows)
    if (
      row.groupKey &&
      !row.targetId &&
      !model.rows.some((r) => r.groupKey === row.groupKey && r.primary)
    )
      delete result[row.key];
  const rejected = findInvalidImportRows(
    baseline,
    toImportSelection(model, result),
  );
  for (const entry of rejected)
    dropGroup(
      result,
      model.rows,
      `${entry.categoryId}.${entry.sectionId}.${entry.sourceRow}`,
    );
  return result;
}

function dropGroup(
  result: Record<string, boolean>,
  rows: readonly ReviewRow[],
  key: string,
) {
  for (const row of rows) if (row.groupKey === key) delete result[row.key];
}

export function toImportSelection(
  model: ReviewModel,
  chosen: Readonly<Record<string, boolean>>,
): ImportSelection {
  const single: Partial<Record<SingleProfileCategoryId, FieldValues>> = {};
  const entries: NonNullable<ImportSelection["entries"]> = [];
  for (const row of model.rows) {
    if (!chosen[row.key]) continue;
    if (!row.groupKey) {
      const id = row.categoryId as SingleProfileCategoryId;
      single[id] = { ...single[id], [row.fieldId]: row.value };
      continue;
    }
    let entry = entries.find(
      (e) =>
        e.categoryId === row.categoryId &&
        e.sectionId === row.sectionId &&
        e.sourceRow === row.rowIndex,
    );
    if (!entry) {
      entry = {
        categoryId: row.categoryId as RepeatedProfileCategoryId,
        sectionId: row.sectionId!,
        sourceRow: row.rowIndex!,
        ...(row.targetId ? { targetId: row.targetId } : {}),
        values: {},
      };
      entries.push(entry);
    }
    entry.values[row.fieldId] = row.value;
  }
  return { single, entries };
}
