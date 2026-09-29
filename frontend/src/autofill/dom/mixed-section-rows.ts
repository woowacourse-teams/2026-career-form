import type { Profile, ProfileEntry } from "../../profile/model";
import {
  type EducationRowKind,
  type EducationSectionId,
  kindOfEntry,
  kindOfOptionText,
  sectionOfKind,
} from "../profile/education-row-kind";
import { CONTROL_SELECTOR } from "./generic-form-groups";
import { formsSingleRepeatGroup } from "./repeat-groups";

/**
 * One repeat group whose rows each start with the same education-kind select,
 * and whose options cover more than one profile section.
 */
export interface MixedSectionGroup {
  rows: readonly Element[];
  kindSelects: readonly HTMLSelectElement[];
  /** Option text for each kind the select offers. */
  optionKinds: ReadonlyMap<EducationRowKind, string>;
  coveredKinds: ReadonlySet<EducationRowKind>;
  coveredSections: ReadonlySet<EducationSectionId>;
}

export interface MixedRowAssignment {
  entry: ProfileEntry;
  sectionId: EducationSectionId;
  /** Position of the entry among entries of the same section. */
  sectionIndex: number;
  kind?: EducationRowKind;
  /** Undefined when the row cannot be prepared (2.4). */
  optionText?: string;
}

function optionTexts(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) =>
    (option.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

function isShown(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = node.parentElement)
    if (
      node.hasAttribute("hidden") ||
      view?.getComputedStyle(node).display === "none"
    )
      return false;
  return true;
}

function firstShownControl(row: Element): Element | undefined {
  return Array.from(row.querySelectorAll(CONTROL_SELECTOR)).find(isShown);
}

/**
 * The row's currently rendered kind select. Per-kind branches may swap which
 * copy is rendered after a kind change, so this re-reads the row.
 */
export function shownKindSelect(
  row: Element,
  reference: HTMLSelectElement,
): HTMLSelectElement | undefined {
  const first = firstShownControl(row);
  return first instanceof HTMLSelectElement &&
    optionTexts(first).join("\u0000") === optionTexts(reference).join("\u0000")
    ? first
    : undefined;
}

export function detectMixedSectionGroup(
  container: Element,
  rows: readonly Element[],
  explicitGroupId: (row: Element) => string | undefined = () => undefined,
): MixedSectionGroup | undefined {
  if (rows.length === 0) return undefined;
  if (!formsSingleRepeatGroup(container, rows, explicitGroupId))
    return undefined;
  const kindSelects: HTMLSelectElement[] = [];
  for (const row of rows) {
    const first = firstShownControl(row);
    if (!(first instanceof HTMLSelectElement)) return undefined;
    kindSelects.push(first);
  }
  const texts = optionTexts(kindSelects[0]!);
  if (
    kindSelects.some(
      (select) => optionTexts(select).join("\u0000") !== texts.join("\u0000"),
    )
  )
    return undefined;
  const optionKinds = new Map<EducationRowKind, string>();
  for (const text of texts) {
    const kind = kindOfOptionText(text);
    if (!kind) continue;
    if (optionKinds.has(kind)) return undefined;
    optionKinds.set(kind, text);
  }
  const coveredKinds = new Set(optionKinds.keys());
  const coveredSections = new Set([...coveredKinds].map(sectionOfKind));
  if (coveredSections.size < 2) return undefined;
  return { rows, kindSelects, optionKinds, coveredKinds, coveredSections };
}

/** Covered-section education entries in profile order; one per needed row. */
export function assignMixedRows(
  profile: Profile,
  group: MixedSectionGroup,
): MixedRowAssignment[] {
  const seen = new Map<string, number>();
  return profile.education.flatMap((entry): MixedRowAssignment[] => {
    const sectionId = entry.sectionId as EducationSectionId;
    if (!group.coveredSections.has(sectionId)) return [];
    const sectionIndex = seen.get(sectionId) ?? 0;
    seen.set(sectionId, sectionIndex + 1);
    const kind = kindOfEntry(entry);
    const optionText = kind ? group.optionKinds.get(kind) : undefined;
    return [
      {
        entry,
        sectionId,
        sectionIndex,
        ...(kind ? { kind } : {}),
        ...(optionText ? { optionText } : {}),
      },
    ];
  });
}
