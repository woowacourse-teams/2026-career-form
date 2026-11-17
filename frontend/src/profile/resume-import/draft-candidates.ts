import { formatProfileDate } from "../../autofill/profile/date-format";
import { CATALOG } from "../catalog";
import {
  catalogKindForField,
  catalogLabels,
  normalizeCatalogQuery,
  searchCatalog,
  type CatalogEntry,
} from "../catalog-search";
import {
  PROFILE_CATEGORIES,
  type ProfileFieldDefinition,
} from "../field-definitions";
import type { ProfileCategoryId } from "../model";
import type { ImportCandidate } from "../page-import/reader";
import {
  REPEATED_DRAFT_CATEGORIES,
  SINGLE_DRAFT_CATEGORIES,
  type ResumeDraft,
} from "./resume-import-client";

export type DraftSkipReason = "catalog_unmatched" | "invalid_value";

export interface DraftStats {
  /** Values per single category and entries per repeated category, as received. */
  draftCounts: Record<ProfileCategoryId, number>;
  catalogMatched: number;
  catalogEmptied: number;
  /** Dates given as YYYY-MM and stored as YYYY-MM-01. */
  monthDates: number;
}
export interface DraftConversion {
  candidates: ImportCandidate[];
  skipped: Partial<Record<DraftSkipReason, number>>;
  stats: DraftStats;
}

/**
 * The same formats the import save (merge.ts) accepts, checked up front so one
 * odd value cannot make the whole selection unsavable.
 */
/** A YYYY-MM date becomes YYYY-MM-01; anything else is returned unchanged. */
function dayFilledDate(field: ProfileFieldDefinition, value: string) {
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return field.inputType === "date" && month ? `${value}-01` : undefined;
}

function storable(field: ProfileFieldDefinition, value: string): boolean {
  if (field.inputType === "date")
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      formatProfileDate(value, "YYYY-MM-DD").status === "resolved"
    );
  if (field.inputType === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (field.inputType === "tel") return /^0\d{9,10}$/.test(value);
  return true;
}

/** An exact name or alias wins; otherwise the search must return one entry. */
function catalogMatch(
  catalog: readonly CatalogEntry[],
  kind: NonNullable<ReturnType<typeof catalogKindForField>>,
  value: string,
): CatalogEntry | undefined {
  const results = searchCatalog(catalog, kind, value);
  const query = normalizeCatalogQuery(value);
  const exact = results.filter((entry) =>
    catalogLabels(entry).some(
      (label) => normalizeCatalogQuery(label) === query,
    ),
  );
  if (exact.length === 1) return exact[0];
  return exact.length === 0 && results.length === 1 ? results[0] : undefined;
}

/** Converts the server draft into the candidates the existing import review uses. */
export function draftToCandidates(
  draft: ResumeDraft,
  catalog: readonly CatalogEntry[] = CATALOG,
): DraftConversion {
  const candidates: ImportCandidate[] = [];
  const skipped: Partial<Record<DraftSkipReason, number>> = {};
  const skip = (reason: DraftSkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const stats: DraftStats = {
    draftCounts: Object.fromEntries(
      PROFILE_CATEGORIES.map((category) => [category.id, 0]),
    ) as Record<ProfileCategoryId, number>,
    catalogMatched: 0,
    catalogEmptied: 0,
    monthDates: 0,
  };

  const add = (
    categoryId: ProfileCategoryId,
    sectionId: string,
    fields: readonly ProfileFieldDefinition[],
    values: Record<string, string>,
    rowIndex?: number,
  ) => {
    for (const [fieldId, raw] of Object.entries(values)) {
      let value = raw.trim();
      if (!value) continue;
      const field = fields.find((item) => item.id === fieldId);
      const filled = field && dayFilledDate(field, value);
      if (filled) value = filled;
      if (!field || !storable(field, value)) {
        skip("invalid_value");
        continue;
      }
      const kind = catalogKindForField(sectionId, fieldId);
      if (kind) {
        const entry = catalogMatch(catalog, kind, value);
        if (!entry) {
          stats.catalogEmptied += 1;
          skip("catalog_unmatched");
          continue;
        }
        stats.catalogMatched += 1;
        value = entry.name;
      }
      candidates.push({
        source: `resume.${categoryId}.${sectionId}.${rowIndex ?? "-"}.${fieldId}`,
        profileFieldKey: `${categoryId}.${sectionId}.${fieldId}`,
        ...(rowIndex === undefined ? {} : { rowIndex }),
        status: "available",
        reason: "resume",
        value,
        ...(field.inputType === "date" ? { precision: "day" as const } : {}),
        ...(filled ? { dayFilled: true } : {}),
      });
      if (filled) stats.monthDates += 1;
    }
  };

  for (const categoryId of SINGLE_DRAFT_CATEGORIES) {
    const values = draft[categoryId] ?? {};
    stats.draftCounts[categoryId] = Object.keys(values).length;
    const category = PROFILE_CATEGORIES.find((item) => item.id === categoryId)!;
    for (const section of category.sections) {
      const own = Object.fromEntries(
        Object.entries(values).filter(([id]) =>
          section.fields.some((field) => field.id === id),
        ),
      );
      add(categoryId, section.id, section.fields, own);
    }
    const known = new Set(
      category.sections.flatMap((section) => section.fields.map((f) => f.id)),
    );
    for (const [id, value] of Object.entries(values))
      if (!known.has(id) && value.trim()) skip("invalid_value");
  }

  for (const categoryId of REPEATED_DRAFT_CATEGORIES) {
    const entries = draft[categoryId] ?? [];
    stats.draftCounts[categoryId] = entries.length;
    const category = PROFILE_CATEGORIES.find((item) => item.id === categoryId)!;
    const rows = new Map<string, number>();
    for (const entry of entries) {
      const section = category.sections.find(
        (item) => item.id === entry.sectionId,
      );
      if (!section) {
        skip("invalid_value");
        continue;
      }
      const before = candidates.length;
      const rowIndex = rows.get(section.id) ?? 0;
      add(categoryId, section.id, section.fields, entry.values, rowIndex);
      // An entry left with nothing does not take a number.
      if (candidates.length > before) rows.set(section.id, rowIndex + 1);
    }
  }
  return { candidates, skipped, stats };
}
