import type { Profile, ProfileCategoryId } from "../../profile/model";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type {
  InteractionCandidate,
  InteractionRole,
  TargetKind,
} from "../api/interaction-types";
import type {
  ActionCandidate,
  AnalysisApiClient,
  FieldCandidate,
  SectionClassifyRequest,
  SectionControlKind,
} from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
  isFieldCandidateHidden,
  type PreparationCollectedSnapshot,
} from "../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import {
  kindOfEntry,
  kindOfOptionText,
  sectionOfKind,
  type EducationRowKind,
} from "../profile/education-row-kind";
import { genericRowFor } from "../dom/repeatable-rows";
import { iconGlyphLabel } from "../dom/icon-glyph";
import {
  ADD_LABEL,
  FORBIDDEN_LABEL,
  actionLabel,
} from "../dom/generic-form-groups";
import { stageRowsAround } from "./education-stage-rows";
import { acquireDocumentRun } from "../interaction/document-run";
import {
  bindGenericStructureRows,
  createGenericStructureContext,
  type GenericStructureContext,
} from "./structure-context";
import { isSafeStructuralClick } from "./click-policy";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "./generic-analysis";
import { decideRowKindOptions } from "./row-kind-options";
import {
  segmentGenericSections,
  type GenericSection,
  type SegmentField,
} from "./section-segments";

/** Rows or openings one section may receive before the loop gives up on it. */
const MAX_ACTIONS_PER_SECTION = 10;
const MAX_FAILURES_PER_CANDIDATE = 2;
const MAX_ITERATIONS = 200;
const MAX_LABEL_LENGTH = 120;
const COLLECTION_OPTIONS = { mixedSectionDetection: false, titleNameCues: true } as const;

export type StructureActionKind =
  "ADD_ROW" | "REVEAL_SECTION" | "SELECT_ROW_KIND";

/** What the loop did, with structure only: never a profile or input value. */
export interface StructureLoopAction {
  kind: StructureActionKind;
  sectionTitle?: string;
  result: "done" | "blocked";
  reason?: string;
  rowIndex?: number;
  rowsBefore?: number;
  rowsAfter?: number;
}

export interface RemainingPoint {
  kind: "ADD_ROW" | "REVEAL_SECTION" | "SELECT_ROW_KIND";
  sectionTitle?: string;
  category?: string;
  /** ADD_ROW only. */
  rows?: number;
  needed?: number;
  /** SELECT_ROW_KIND only. */
  rowIndex?: number;
}

export interface StructureLoopQuestion {
  role: Extract<
    InteractionRole,
    "REPEAT_ADD" | "SECTION_REVEAL" | "ROW_KIND_OPTION"
  >;
  /** Display names of the candidates that were asked about. */
  candidates: string[];
}

export interface StructureLoopSection {
  title?: string;
  category?: string;
  status: "OPEN" | "BLOCKED";
  reason?: string;
  blockedRows: number[];
}

export type StructureLoopStop =
  "NONE_REMAINING" | "NO_PROGRESS" | "ABORTED" | "ITERATION_LIMIT" | "FAILED";

export interface StructureLoopResult {
  context: GenericStructureContext;
  stopReason: StructureLoopStop;
  actions: StructureLoopAction[];
  sections: StructureLoopSection[];
  /** The remaining points computed before the first action. */
  initialRemaining: RemainingPoint[];
  questions: StructureLoopQuestion[];
}

export interface StructureLoopOptions {
  document: Document;
  profile: Profile;
  apiClient: AnalysisApiClient;
  signal?: AbortSignal;
  onAction?: (action: StructureLoopAction) => void;
}

type LoopField = SegmentField & { candidate: FieldCandidate };

interface RowGroup {
  key: string;
  title?: string;
  category?: string;
  rows: GenericSection<LoopField>[];
  /** A classified education section without repeat-row or add-row semantics. */
  singleRow?: Element;
}

interface Observation {
  prep: PreparationCollectedSnapshot;
  groups: RowGroup[];
  sections: GenericSection<LoopField>[];
  fieldsSnapshot: ReturnType<typeof collectFieldsSnapshot>;
  fieldCount: number;
}

interface ActionRef {
  candidateId: string;
  element: HTMLElement;
  label: string;
  sectionId: string;
  rows?: number;
  /** What the preparation collector observed about the control. */
  observed: ActionCandidate;
}

type Point =
  | { kind: "ADD_ROW"; group: RowGroup; needed: number; actions: ActionRef[] }
  | { kind: "REVEAL_SECTION"; action: ActionRef }
  | {
      kind: "SELECT_ROW_KIND";
      group: RowGroup;
      rowIndex: number;
      select: HTMLSelectElement;
    };

// Representative profile keys the interaction service accepts per category.
const REPEAT_KEYS: Partial<Record<ProfileCategoryId, string>> = {
  education: "education.university.schoolName",
  careers: "careers.career.companyName",
  certifications: "certifications.certificate.name",
  languages: "languages.languageTest.language",
};
const REVEAL_PRIORITY: readonly ProfileCategoryId[] = [
  "education",
  "careers",
  "certifications",
  "languages",
  "projects",
  "publications",
];
const REPEAT_CATEGORY_BY_RESPONSE = new Map<string, ProfileCategoryId>([
  ["EDUCATION", "education"],
  ["CAREER", "careers"],
  ["CERTIFICATE", "certifications"],
  ["LANGUAGE", "languages"],
  ["PROJECT", "projects"],
  ["PUBLICATION", "publications"],
]);
// Declining to add a row leaves the existing rows untouched, so they stay mappable.
const NO_CLICK_ADD_REASONS = new Set([
  "REPEAT_ADD_ABSTAINED",
  "INTERACTION_UNAVAILABLE",
  "NO_ADD_CONTROL",
]);
// A failed or repeated add that did not change the existing rows leaves them
// mappable too; only the profile entries that needed a new row are given up.
const ROW_PRESERVING_ADD_REASONS = new Set([
  "ADD_CONTROL_GONE",
  "ADD_FAILED",
  "SECTION_ACTION_LIMIT",
  "NO_PROGRESS",
]);
const ROW_CHANGING_EXECUTOR_REASONS = new Set([
  "existing-group-value-changed",
  "invalid-group-count",
  "refresh-failed",
]);
/** In-memory state of the existing rows; a detached control counts as changed. */
const rowsState = (group: RowGroup) =>
  group.rows
    .flatMap((row) => row.fields)
    .map(({ element }) => {
      if (!element.isConnected) return "\u0002";
      if (
        element instanceof HTMLInputElement &&
        (element.type === "checkbox" || element.type === "radio")
      )
        return String(element.checked);
      return element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
        ? element.value
        : "";
    })
    .join("\u0000");
const keepsExistingRows = (reason: string) =>
  NO_CLICK_ADD_REASONS.has(reason) ||
  ROW_PRESERVING_ADD_REASONS.has(reason) ||
  (reason.startsWith("executor:") &&
    !ROW_CHANGING_EXECUTOR_REASONS.has(reason.slice("executor:".length)));

const TARGET_OF_ROW_KIND: Record<EducationRowKind, TargetKind> = {
  HIGH_SCHOOL: "HIGH_SCHOOL",
  JUNIOR_COLLEGE: "ASSOCIATE",
  UNIVERSITY: "BACHELOR",
  MASTER: "MASTER",
  DOCTOR: "DOCTOR",
};

function profileKeyOf(category: ProfileCategoryId): string | undefined {
  const known = REPEAT_KEYS[category];
  if (known) return known;
  const definition = PROFILE_CATEGORIES.find(({ id }) => id === category);
  const section = definition?.sections[0];
  const field = section?.fields[0];
  return section && field ? `${category}.${section.id}.${field.id}` : undefined;
}

function repeatedEntries(
  profile: Profile,
  category: string | undefined,
): number | undefined {
  if (!category) return undefined;
  const entries = (profile as unknown as Record<string, unknown>)[category];
  return Array.isArray(entries) ? entries.length : undefined;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function truncated(text: string): string {
  return text.slice(0, MAX_LABEL_LENGTH);
}

function controlKind(candidate: FieldCandidate): SectionControlKind {
  switch (candidate.control) {
    case "text": {
      const inputType = candidate.semanticContext?.inputType;
      return inputType === "date" || inputType === "month" ? "DATE" : "TEXT";
    }
    case "textarea":
      return "TEXTAREA";
    case "select":
      return "SELECT";
    case "radio":
      return "RADIO";
    case "checkbox":
      return "CHECKBOX";
    case "button":
      return "BUTTON";
    default:
      return "OTHER";
  }
}

function visibleControlCount(document: Document): number {
  const view = document.defaultView;
  return Array.from(
    document.querySelectorAll("input, select, textarea"),
  ).filter((control) => {
    if (control.closest("[hidden], [aria-hidden='true' i]")) return false;
    for (let node: Element | null = control; node; node = node.parentElement)
      if (view?.getComputedStyle(node).display === "none") return false;
    return true;
  }).length;
}

function normalizedLabel(text: string | null | undefined): string {
  return truncated(text?.replace(/\s+/g, " ").trim() ?? "");
}

/** The control's own name with the attribute or text it was read from. */
function controlLabel(
  element: HTMLElement,
): { source: "aria-label" | "label" | "title"; text: string } | undefined {
  const aria = normalizedLabel(element.getAttribute("aria-label"));
  if (aria) return { source: "aria-label", text: aria };
  const text = normalizedLabel(element.textContent);
  if (text) return { source: "label", text };
  const title = normalizedLabel(element.getAttribute("title"));
  if (title) return { source: "title", text: title };
  const glyph = iconGlyphLabel(element);
  return glyph ? { source: "label", text: glyph } : undefined;
}

function isHiddenElement(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return true;
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden"))
      return true;
  }
  return false;
}

/** What a listbox control shows: its text, or the value its input shows. */
function displayedValue(control: HTMLElement): string {
  const inputs =
    control instanceof HTMLInputElement
      ? [control]
      : Array.from(control.querySelectorAll("input"));
  const shown =
    inputs.length === 1 && inputs[0]!.value.trim()
      ? inputs[0]!.value
      : control.textContent;
  return normalizedLabel(
    shown?.trim() ? shown : control.getAttribute("aria-valuetext"),
  );
}

/** The order and kind of the controls a box holds, without their values. */
function controlLayout(box: Element): string {
  return Array.from(
    box.querySelectorAll("input, textarea, select, [aria-haspopup='listbox']"),
  )
    .map((control) =>
      [
        control.tagName,
        control.getAttribute("type") ?? "",
        control.getAttribute("placeholder") ?? "",
        control.getAttribute("aria-haspopup") ?? "",
      ].join("/"),
    )
    .join("|");
}

/** The server rejects a structure question holding any other candidate. */
function isOfferableAddControl({ observed }: ActionRef): boolean {
  return (
    observed.visibility === "visible" &&
    observed.control === "button" &&
    observed.element !== "select" &&
    !observed.disabled &&
    !observed.readonly &&
    !observed.inert
  );
}

/** A control named for adding: "add" text or a drawn plus, never a removal. */
function isAddLike(element: HTMLElement): boolean {
  const label = actionLabel(element);
  return label
    ? ADD_LABEL.test(label) && !FORBIDDEN_LABEL.test(label)
    : iconGlyphLabel(element) === "+";
}

function sectionCacheKey(section: GenericSection<LoopField>): string {
  return JSON.stringify([
    section.fingerprint,
    section.title ?? "",
    section.parentTitle ?? "",
    section.boundary === "repeat-row",
  ]);
}

/**
 * Generic-document structural loop: observe, take one allowed structural
 * action, verify, repeat. It adds repeated rows up to the local profile entry
 * count, opens collapsed sections and chooses education row kinds, never
 * clicking anything `isSafeStructuralClick` refuses and never asking the
 * server about the same control twice. A failure blocks only its section.
 */
export async function runGenericStructureLoop(
  options: StructureLoopOptions,
): Promise<StructureLoopResult> {
  const { document, profile, apiClient, signal, onAction } = options;
  const initialUrl = document.URL;
  const actions: StructureLoopAction[] = [];
  const questions: StructureLoopQuestion[] = [];
  const blocked = new Map<string, StructureLoopSection>();
  const classified = new Map<string, string>();
  const context = createGenericStructureContext();
  const groupScopes = new Map<string, Element>();
  const addDecision = new Map<string, Element | null>();
  const addDecisionLook = new Map<string, string>();
  const lookOf = (element: Element) =>
    `${element.tagName}\u0000${normalizedLabel(element.textContent)}\u0000${element.getAttribute("aria-label") ?? ""}`;
  const revealAsked = new WeakSet<Element>();
  const revealChosen = new WeakSet<Element>();
  const rowKindOptions = new Map<string, Map<TargetKind, string | null>>();
  const handledSelects = new WeakSet<Element>();
  const failures = new WeakMap<Element, number>();
  const lastFailure = new Map<string, string>();
  const actionCounts = new WeakMap<Element, number>();
  const sectionsSeen = new Map<string, StructureLoopSection>();
  const containerIds = new WeakMap<Element, string>();
  const containerId = (element: Element): string => {
    let id = containerIds.get(element);
    if (!id) {
      id = `container${containerCounter}`;
      containerCounter += 1;
      containerIds.set(element, id);
    }
    return id;
  };
  let containerCounter = 0;
  let initialRemaining: RemainingPoint[] | undefined;
  let stopReason: StructureLoopStop = "NONE_REMAINING";
  const actionScope = (element: Element): Element =>
    element.closest("section, fieldset, [role='group']") ??
    element.parentElement ??
    document.body;

  const record = (action: StructureLoopAction) => {
    actions.push(action);
    onAction?.(action);
  };
  const sectionOf = (group: RowGroup): StructureLoopSection => {
    const existing = sectionsSeen.get(group.key);
    if (existing) return existing;
    const created: StructureLoopSection = {
      ...(group.title ? { title: group.title } : {}),
      ...(group.category ? { category: group.category } : {}),
      status: "OPEN",
      blockedRows: [],
    };
    sectionsSeen.set(group.key, created);
    return created;
  };
  const blockKey = (key: string, reason: string) => {
    const section = sectionsSeen.get(key);
    if (!section || section.status === "BLOCKED") return;
    section.status = "BLOCKED";
    section.reason = reason;
    blocked.set(key, section);
    const scope = groupScopes.get(key);
    if (scope && !keepsExistingRows(reason))
      context.blockedScopes.set(scope, reason);
    record({
      kind: "ADD_ROW",
      ...(section.title ? { sectionTitle: section.title } : {}),
      result: "blocked",
      reason,
    });
  };
  const blockGroup = (group: RowGroup, reason: string) => {
    sectionOf(group);
    blockKey(group.key, reason);
  };

  async function classify(
    entries: GenericSection<LoopField>[],
    snapshotId: string,
    site: PreparationCollectedSnapshot["request"]["site"],
  ): Promise<void> {
    const pending = new Map<string, GenericSection<LoopField>>();
    for (const section of entries) {
      const key = sectionCacheKey(section);
      if (!classified.has(key) && !pending.has(key)) pending.set(key, section);
    }
    if (pending.size === 0 || !apiClient.classifySections) return;
    const sections: SectionClassifyRequest["sections"] = [];
    const idToKey = new Map<string, string>();
    [...pending].forEach(([key, section], index) => {
      const sectionId = `ls${index + 1}`;
      idToKey.set(sectionId, key);
      sections.push({
        sectionId,
        ...(section.title ? { title: truncated(section.title) } : {}),
        labels: section.fields
          .flatMap(({ candidate }) => candidate.displayName?.trim() || [])
          .slice(0, 32)
          .map((label) => label.slice(0, 200)),
        controlKinds: [
          ...new Set(
            section.fields.map(({ candidate }) => controlKind(candidate)),
          ),
        ],
        repeated: section.boundary === "repeat-row",
      });
    });
    try {
      const response = await apiClient.classifySections({
        schemaVersion: 1,
        snapshotId,
        site,
        sections,
      });
      if (response.status !== "COMPLETE") return;
      for (const { sectionId, category } of response.sections) {
        const key = idToKey.get(sectionId);
        if (key)
          classified.set(
            key,
            REPEAT_CATEGORY_BY_RESPONSE.get(category) ?? category,
          );
      }
    } catch {
      // Unclassified groups are reported as blocked below.
    }
  }

  async function observe(): Promise<Observation> {
    const prep = collectPreparationSnapshot(document, COLLECTION_OPTIONS);
    const fieldsSnapshot = collectFieldsSnapshot(
      document,
      undefined,
      COLLECTION_OPTIONS,
    );
    const fields = new Map<string, LoopField>();
    for (const section of fieldsSnapshot.request.sections)
      for (const candidate of [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ]) {
        if (fields.has(candidate.candidateId)) continue;
        const lookup = fieldsSnapshot.registry.lookupField(
          candidate.candidateId,
        );
        const handle =
          lookup.status === "ready" || lookup.status === "blocked"
            ? lookup.handle
            : undefined;
        const element = handle?.elements[0] ?? handle?.customElements?.[0];
        if (element)
          fields.set(candidate.candidateId, {
            element,
            label: candidate.displayName,
            control: candidate.control,
            candidate,
          });
      }
    const sections = segmentGenericSections(document, [...fields.values()]);
    const candidates = sections.filter(
      (section) =>
        section.boundary === "repeat-row" ||
        section.fields[0]?.element instanceof HTMLSelectElement ||
        listboxKindRow(section, sections) !== undefined ||
        rowBoxOf(section, sections) !== undefined,
    );
    await classify(
      candidates,
      fieldsSnapshot.request.snapshotId,
      fieldsSnapshot.request.site,
    );
    const groups = new Map<string, RowGroup>();
    for (const section of candidates) {
      const category = classified.get(sectionCacheKey(section));
      if (section.boundary !== "repeat-row") {
        if (category !== "education") continue;
        // A summary select beside existing education rows is not another row.
        if (
          candidates.some(
            (other) =>
              other.boundary === "repeat-row" &&
              other.title === section.title &&
              classified.get(sectionCacheKey(other)) === "education",
          )
        )
          continue;
        const first = section.fields[0]!.element;
        const scope = actionScope(first);
        // Keep the receipt local to this section, not unrelated form fields.
        if (
          !section.fields.every(({ element }) => scope.contains(element)) ||
          sections.some(
            (other) =>
              other !== section &&
              other.fields.some(({ element }) => scope.contains(element)),
          )
        )
          continue;
        const key = `${containerId(scope)}|single`;
        groupScopes.set(key, scope);
        groups.set(key, {
          key,
          title: section.title,
          category,
          rows: [section],
          singleRow: scope,
        });
        continue;
      }
      // Rows of one group share a parent. Their labels can change (a chosen
      // row kind shows different fields), so a fingerprint cannot name them.
      const rowElement = section.fields[0]
        ? genericRowFor(section.fields[0].element)
        : undefined;
      const key = rowElement?.parentElement
        ? `${containerId(rowElement.parentElement)}|${section.title ?? ""}`
        : `${section.parentTitle ?? ""}|${section.title ?? ""}|${section.fingerprint}`;
      if (rowElement?.parentElement)
        groupScopes.set(key, rowElement.parentElement);
      const group = groups.get(key) ?? {
        key,
        ...(section.title ? { title: section.title } : {}),
        rows: [],
      };
      if (category && !group.category) group.category = category;
      group.rows.push(section);
      groups.set(key, group);
    }
    return {
      prep,
      groups: [...groups.values()],
      sections,
      fieldsSnapshot,
      fieldCount: fields.size,
    };
  }

  function ownerGroup(
    element: Element,
    groups: readonly RowGroup[],
  ): RowGroup | undefined {
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const found = groups.find((group) =>
        group.rows[0]?.fields[0]
          ? ancestor.contains(group.rows[0].fields[0].element)
          : false,
      );
      if (found) return found;
    }
    return undefined;
  }

  /**
   * The widest ancestor of the group's rows holding no field of another
   * section. Parts of the group's own section (same heading) may share it.
   */
  function groupScope(
    group: RowGroup,
    sections: readonly GenericSection<LoopField>[],
  ): Element | undefined {
    const first = group.rows[0]?.fields[0]?.element;
    let scope =
      first && (genericRowFor(first)?.parentElement ?? first.parentElement);
    if (!scope) return undefined;
    const foreign = sections
      .filter(
        (section) =>
          !group.rows.includes(section) &&
          (!group.title || section.title !== group.title),
      )
      .flatMap((section) => section.fields.map(({ element }) => element));
    while (
      scope.parentElement &&
      !foreign.some((element) => scope!.parentElement!.contains(element))
    )
      scope = scope.parentElement;
    return scope;
  }

  const isCollapsedControl = (
    ref: ActionRef,
    groups: readonly RowGroup[],
  ): boolean =>
    ref.element.getAttribute("aria-expanded") === "false" &&
    !ownerGroup(ref.element, groups);

  function actionRefs(observation: Observation): ActionRef[] {
    const refs: ActionRef[] = [];
    for (const section of observation.prep.request.sections)
      for (const candidate of section.actionCandidates) {
        const lookup = observation.prep.registry.lookupAction(
          candidate.candidateId,
        );
        if (!("handle" in lookup) || lookup.status !== "ready") continue;
        const element = lookup.handle.element;
        if (
          !(element instanceof HTMLElement) ||
          !isSafeStructuralClick(element, document.body).allowed
        )
          continue;
        const rows = observation.prep.countRepeatableGroups(
          candidate.candidateId,
        );
        refs.push({
          candidateId: candidate.candidateId,
          element,
          label: truncated(candidate.displayName ?? ""),
          sectionId: section.sectionId,
          ...(rows !== undefined ? { rows } : {}),
          observed: candidate,
        });
      }
    return refs;
  }

  function computePoints(observation: Observation): Point[] {
    const points: Point[] = [];
    const refs = actionRefs(observation);
    // A group whose last add failed and that is no longer found cannot be
    // retried; keep its reason instead of silently dropping it.
    for (const [key, reason] of lastFailure)
      if (!observation.groups.some((group) => group.key === key))
        blockKey(key, reason);
    for (const group of observation.groups) {
      if (group.singleRow) continue;
      const section = sectionOf(group);
      if (!group.category) {
        if (apiClient.classifySections && section.status === "OPEN")
          blockGroup(group, "CLASSIFY_UNAVAILABLE");
        continue;
      }
      const needed = repeatedEntries(profile, group.category);
      if (needed === undefined || section.status === "BLOCKED") continue;
      const scope = groupScope(group, observation.sections);
      const owned = refs.filter(
        (ref) =>
          ref.rows !== undefined &&
          isOfferableAddControl(ref) &&
          ownerGroup(ref.element, observation.groups) === group &&
          scope?.contains(ref.element) === true,
      );
      const rows = owned[0]?.rows || group.rows.length;
      if (rows < needed)
        points.push({ kind: "ADD_ROW", group, needed, actions: owned });
    }
    for (const ref of refs)
      if (isCollapsedControl(ref, observation.groups))
        points.push({ kind: "REVEAL_SECTION", action: ref });
    for (const group of observation.groups) {
      if (group.category !== "education") continue;
      if (sectionOf(group).status === "BLOCKED") continue;
      group.rows.forEach((row, rowIndex) => {
        const first = row.fields[0]?.element;
        const scope =
          group.singleRow ?? (first && genericRowFor(first)?.parentElement);
        if (first instanceof HTMLSelectElement && scope)
          context.educationGroups.add(scope);
        if (
          first instanceof HTMLSelectElement &&
          !handledSelects.has(first) &&
          rowIndex < profile.education.length &&
          Array.from(first.options).filter(
            (option) => option.value !== "" && option.textContent?.trim(),
          ).length >= 2
        )
          points.push({
            kind: "SELECT_ROW_KIND",
            group,
            rowIndex,
            select: first,
          });
      });
    }
    return points;
  }

  const describe = (point: Point): RemainingPoint => {
    switch (point.kind) {
      case "ADD_ROW":
        return {
          kind: "ADD_ROW",
          ...(point.group.title ? { sectionTitle: point.group.title } : {}),
          ...(point.group.category ? { category: point.group.category } : {}),
          rows: point.actions[0]?.rows || point.group.rows.length,
          needed: point.needed,
        };
      case "REVEAL_SECTION":
        return {
          kind: "REVEAL_SECTION",
          ...(point.action.label ? { sectionTitle: point.action.label } : {}),
        };
      default:
        return {
          kind: "SELECT_ROW_KIND",
          ...(point.group.title ? { sectionTitle: point.group.title } : {}),
          category: "education",
          rowIndex: point.rowIndex,
        };
    }
  };

  const interactionCandidate = (ref: ActionRef): InteractionCandidate => ({
    candidateId: ref.candidateId,
    element: "button",
    control: "button",
    visibility: "visible",
    relationToTarget: "SAME_CONTAINER",
    ...(ref.label
      ? { semanticContext: { labels: [{ source: "label", text: ref.label }] } }
      : {}),
  });

  /** Only observed evidence: the control's own name, the group's heading. */
  const repeatAddCandidate = (
    ref: ActionRef,
    group: RowGroup,
  ): InteractionCandidate => {
    const inRow = group.rows.some((row) => {
      const first = row.fields[0]?.element;
      return first ? genericRowFor(first)?.contains(ref.element) : false;
    });
    const own = controlLabel(ref.element);
    const heading = normalizedLabel(group.title);
    const labels = [
      ...(own ? [own] : []),
      ...(heading
        ? [{ source: "section-heading" as const, text: heading }]
        : []),
    ];
    return {
      candidateId: ref.candidateId,
      element: ref.observed.element as InteractionCandidate["element"],
      control: "button",
      visibility: ref.observed.visibility,
      // Owned controls sit inside the group's scope (see groupScope).
      relationToTarget: inRow ? "SAME_REPEAT_ROW" : "SAME_CONTAINER",
      ...(labels.length > 0 ? { semanticContext: { labels } } : {}),
    };
  };

  /** Asks once; undefined means the server could not decide. */
  async function askButtons(
    role: "REPEAT_ADD" | "SECTION_REVEAL",
    canonicalFieldKey: string,
    refs: ActionRef[],
    observation: Observation,
    describeCandidate: (
      ref: ActionRef,
    ) => InteractionCandidate = interactionCandidate,
  ): Promise<string | null | undefined> {
    questions.push({ role, candidates: refs.map(({ label }) => label) });
    if (!apiClient.decideInteractions) return undefined;
    try {
      const response = await apiClient.decideInteractions({
        schemaVersion: 2,
        snapshotId: observation.fieldsSnapshot.request.snapshotId,
        site: observation.prep.request.site,
        decisions: [
          {
            decisionId: "structure",
            role,
            canonicalFieldKey,
            candidates: refs.map(describeCandidate),
          },
        ],
      });
      if (response.status !== "COMPLETE") return undefined;
      const decision = response.decisions.find(
        ({ decisionId }) => decisionId === "structure",
      );
      return decision?.selection === "SELECTED" && decision.candidateId
        ? decision.candidateId
        : null;
    } catch {
      return undefined;
    }
  }

  const executionSnapshot = (
    collected: PreparationCollectedSnapshot,
    visible: () => boolean = () => true,
  ): PreparationSnapshot => ({
    registry: collected.registry,
    isTargetSectionVisible: visible,
    countRepeatableGroups: (plan) =>
      collected.countRepeatableGroups(plan.actionCandidateId),
    repeatableGroupState: (plan) =>
      collected.repeatableGroupState(plan.actionCandidateId),
  });

  const aborted = () =>
    signal?.aborted === true || document.URL !== initialUrl;

  async function addRow(
    point: Extract<Point, { kind: "ADD_ROW" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { group } = point;
    const scope = actionScope(group.rows[0]!.fields[0]!.element);
    const used = actionCounts.get(scope) ?? 0;
    if (used >= MAX_ACTIONS_PER_SECTION) {
      blockGroup(group, "SECTION_ACTION_LIMIT");
      return false;
    }
    if (!addDecision.has(group.key)) {
      if (point.actions.length === 0) {
        blockGroup(group, lastFailure.get(group.key) ?? "NO_ADD_CONTROL");
        return false;
      }
      const category = group.category as ProfileCategoryId;
      const key = profileKeyOf(category);
      const chosenId = key
        ? await askButtons(
            "REPEAT_ADD",
            key,
            point.actions,
            observation,
            (ref) => repeatAddCandidate(ref, group),
          )
        : undefined;
      if (chosenId === undefined) {
        blockGroup(group, "INTERACTION_UNAVAILABLE");
        addDecision.set(group.key, null);
        return false;
      }
      const chosen = point.actions.find((ref) => ref.candidateId === chosenId);
      addDecision.set(group.key, chosen?.element ?? null);
      if (chosen) addDecisionLook.set(group.key, lookOf(chosen.element));
      if (!chosen) {
        blockGroup(group, "REPEAT_ADD_ABSTAINED");
        return false;
      }
    }
    let element = addDecision.get(group.key);
    if (!element) return false;
    // A page may re-render the chosen add control after each added row, or
    // turn it into the new row's own control (for example a delete button).
    // The choice carries over only to the one offered control that looks as
    // the chosen one looked when it was chosen.
    if (!point.actions.some((ref) => ref.element === element)) {
      const look = addDecisionLook.get(group.key);
      const same = point.actions.filter(
        (ref) => look !== undefined && lookOf(ref.element) === look,
      );
      if (same.length === 1) {
        element = same[0]!.element;
        addDecision.set(group.key, element);
      }
    }
    const action = point.actions.find((ref) => ref.element === element);
    if (!action) {
      blockGroup(group, lastFailure.get(group.key) ?? "ADD_CONTROL_GONE");
      return false;
    }
    if ((failures.get(element) ?? 0) >= MAX_FAILURES_PER_CANDIDATE) {
      blockGroup(group, lastFailure.get(group.key) ?? "ADD_FAILED");
      return false;
    }
    const rowsBefore = action.rows ?? group.rows.length;
    const stateBefore = rowsState(group);
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: action.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: rowsBefore + 1,
        },
      ],
      document,
      ...(signal ? { signal } : {}),
      beforeMutation: async () =>
        !aborted() && isSafeStructuralClick(action.element, document.body).allowed,
      initialSnapshot: executionSnapshot(observation.prep),
      refreshSnapshot: async () => {
        await settle();
        return executionSnapshot(
          collectPreparationSnapshot(document, COLLECTION_OPTIONS),
        );
      },
      countRepeatableGroups: (snapshot, plan) =>
        snapshot.countRepeatableGroups?.(plan) ?? Number.NaN,
    });
    actionCounts.set(scope, used + 1);
    if (document.URL !== initialUrl) {
      blockGroup(group, "URL_CHANGED");
      return false;
    }
    if (result.status === "completed") {
      record({
        kind: "ADD_ROW",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "done",
        rowsBefore,
        rowsAfter: rowsBefore + 1,
      });
      return true;
    }
    // The executor checks existing values only after a verified addition.
    if (rowsState(group) !== stateBefore) {
      blockGroup(group, "executor:existing-group-value-changed");
      return false;
    }
    const reason =
      result.status === "failed" ? result.reason : "approval-required";
    failures.set(element, (failures.get(element) ?? 0) + 1);
    lastFailure.set(group.key, `executor:${reason}`);
    if ((failures.get(element) ?? 0) >= MAX_FAILURES_PER_CANDIDATE)
      blockGroup(group, `executor:${reason}`);
    return true;
  }

  async function revealSection(
    point: Extract<Point, { kind: "REVEAL_SECTION" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { action } = point;
    const scope = actionScope(action.element);
    const used = actionCounts.get(scope) ?? 0;
    const blockReveal = (reason: string) => {
      context.blockedScopes.set(scope, reason);
      sectionsSeen.set(`reveal:${containerId(scope)}`, {
        title: action.label,
        status: "BLOCKED",
        reason,
        blockedRows: [],
      });
      record({
        kind: "REVEAL_SECTION",
        ...(action.label ? { sectionTitle: action.label } : {}),
        result: "blocked",
        reason,
      });
    };
    if (used >= MAX_ACTIONS_PER_SECTION) {
      revealAsked.add(action.element);
      blockReveal("SECTION_ACTION_LIMIT");
      return false;
    }
    if (!revealAsked.has(action.element)) {
      const refs = [action];
      const category =
        REVEAL_PRIORITY.find((id) => (repeatedEntries(profile, id) ?? 0) > 0) ??
        "education";
      const chosenId = await askButtons(
        "SECTION_REVEAL",
        profileKeyOf(category) ?? "personal.personal.koreanFamilyName",
        refs,
        observation,
      );
      refs.forEach((ref) => revealAsked.add(ref.element));
      const chosen = refs.find((ref) => ref.candidateId === chosenId);
      if (chosen) revealChosen.add(chosen.element);
      if (chosenId === undefined || chosenId === null)
        blockReveal(
          chosenId === undefined
            ? "INTERACTION_UNAVAILABLE"
            : "SECTION_REVEAL_ABSTAINED",
        );
    }
    if (!revealChosen.has(action.element)) return false;
    revealChosen.delete(action.element);
    const before = visibleControlCount(document);
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: action.candidateId,
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: action.sectionId,
          },
          approved: true,
        },
      ],
      document,
      ...(signal ? { signal } : {}),
      beforeMutation: async () =>
        !aborted() && isSafeStructuralClick(action.element, document.body).allowed,
      initialSnapshot: executionSnapshot(observation.prep),
      refreshSnapshot: async () => {
        await settle();
        return executionSnapshot(
          collectPreparationSnapshot(document, COLLECTION_OPTIONS),
          () => visibleControlCount(document) > before,
        );
      },
      countRepeatableGroups: () => Number.NaN,
    });
    actionCounts.set(scope, used + 1);
    if (document.URL !== initialUrl) {
      blockReveal("URL_CHANGED");
      return false;
    }
    if (result.status === "completed")
      record({
        kind: "REVEAL_SECTION",
        ...(action.label ? { sectionTitle: action.label } : {}),
        result: "done",
      });
    else
      blockReveal(
        `executor:${
          result.status === "failed" ? result.reason : "approval-required"
        }`,
      );
    return result.status === "completed";
  }

  async function selectRowKind(
    point: Extract<Point, { kind: "SELECT_ROW_KIND" }>,
    observation: Observation,
  ): Promise<boolean> {
    const { group, rowIndex, select } = point;
    const rowElement = group.singleRow ?? genericRowFor(select);
    handledSelects.add(select);
    const section = sectionOf(group);
    const blockRow = (reason: string) => {
      section.blockedRows.push(rowIndex);
      if (rowElement) context.blockedScopes.set(rowElement, reason);
      record({
        kind: "SELECT_ROW_KIND",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "blocked",
        reason,
        rowIndex,
      });
      return false;
    };
    const scope = actionScope(select);
    const used = actionCounts.get(scope) ?? 0;
    if (used >= MAX_ACTIONS_PER_SECTION) {
      blockGroup(group, "SECTION_ACTION_LIMIT");
      return false;
    }
    const optionList = Array.from(select.options)
      .map((option, index) => ({
        index,
        text: option.textContent?.replace(/\s+/g, " ").trim() ?? "",
        value: option.value,
      }))
      .filter((option) => option.value !== "" && option.text);
    const signature = optionList.map(({ text }) => text).join("\u0000");
    let byTarget = rowKindOptions.get(signature);
    if (!byTarget) {
      questions.push({
        role: "ROW_KIND_OPTION",
        candidates: optionList.map(({ text }) => truncated(text)),
      });
      try {
        byTarget = apiClient.decideInteractions
          ? await decideRowKindOptions(
              {
                decideInteractions:
                  apiClient.decideInteractions.bind(apiClient),
              },
              {
                snapshotId: observation.fieldsSnapshot.request.snapshotId,
                site: observation.prep.request.site,
                canonicalFieldKey: REPEAT_KEYS.education!,
                relationToTarget: group.singleRow
                  ? "SAME_CONTAINER"
                  : "SAME_REPEAT_ROW",
                options: optionList.map((option) => ({
                  optionId: String(option.index),
                  visibility: "visible" as const,
                  semanticContext: {
                    labels: [
                      {
                        source: "label" as const,
                        text: truncated(option.text),
                      },
                    ],
                  },
                })),
              },
            )
          : new Map();
      } catch {
        byTarget = new Map();
      }
      rowKindOptions.set(signature, byTarget);
    }
    let profileIndex = rowIndex;
    if (group.singleRow) {
      const latest = profile.education
        .map((entry) => entry.values.latestEducationType)
        .find(Boolean);
      const latestKind = latest && kindOfOptionText(latest);
      const rank: EducationRowKind[] = [
        "HIGH_SCHOOL",
        "JUNIOR_COLLEGE",
        "UNIVERSITY",
        "MASTER",
        "DOCTOR",
      ];
      profileIndex = profile.education.findIndex(
        (entry) => latestKind && kindOfEntry(entry) === latestKind,
      );
      if (profileIndex < 0)
        profileIndex = profile.education.reduce((best, entry, index) => {
          const kind = kindOfEntry(entry);
          const previous =
            best < 0 ? undefined : kindOfEntry(profile.education[best]!);
          return kind && (!previous || rank.indexOf(kind) > rank.indexOf(previous))
            ? index
            : best;
        }, -1);
    }
    const entry = profile.education[profileIndex];
    const kind = entry && kindOfEntry(entry);
    if (!kind) return blockRow("NO_PROFILE_STAGE");
    const optionId = byTarget.get(TARGET_OF_ROW_KIND[kind]);
    if (!optionId) return blockRow("ROW_KIND_OPTION_UNDECIDED");
    const selectedOption = select.options[select.selectedIndex];
    const implicitPrompt =
      select.selectedIndex === 0 &&
      selectedOption?.getAttribute("value") === null &&
      selectedOption.text.trim() === "선택";
    const preselected = select.value !== "" && !implicitPrompt;
    if (preselected && select.selectedIndex !== Number(optionId))
      return blockRow("ROW_KIND_MISMATCH");
    if (aborted()) return false;
    const release = acquireDocumentRun(document);
    if (!release) return blockRow("run-in-progress");
    try {
      actionCounts.set(scope, used + 1);
      if (!preselected) {
        select.selectedIndex = Number(optionId);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
      }
      if (document.URL !== initialUrl) return blockRow("URL_CHANGED");
      // An area the page renders as uneven rows: bind the stage-select row
      // alone and each sibling row that shows a fixed stage of the same list.
      const split =
        group.singleRow && rowElement
          ? stageRowsAround(select, rowElement)
          : undefined;
      const boundRow = split?.selectRow ?? rowElement;
      for (const fixed of split?.fixedRows ?? []) {
        const fixedKind = kindOfOptionText(fixed.label);
        const fixedIndex = fixedKind
          ? profile.education.findIndex(
              (candidate) => kindOfEntry(candidate) === fixedKind,
            )
          : -1;
        if (!fixedKind || fixedIndex < 0) continue;
        const fixedEntry = profile.education[fixedIndex]!;
        context.educationRows.set(fixed.row, {
          sectionId: sectionOfKind(fixedKind),
          sectionIndex: profile.education
            .slice(0, fixedIndex)
            .filter(
              (previous) => previous.sectionId === fixedEntry.sectionId,
            ).length,
          label: fixed.label,
        });
      }
      if (boundRow) {
        context.educationRows.set(boundRow, {
          sectionId: sectionOfKind(kind),
          sectionIndex: profile.education
            .slice(0, profileIndex)
            .filter((previous) => previous.sectionId === entry!.sectionId)
            .length,
          select,
          selectedValue: select.value,
        });
      }

      // Rematch what the row now shows: only keys of this stage may appear.
      const after = await observe();
      const row = after.groups
        .flatMap((candidateGroup) => candidateGroup.rows)
        .find((candidate) =>
          candidate.fields.some((field) => field.element === select),
        );
      if (!row) return blockRow("ROW_NOT_FOUND");
      const api: Partial<GenericAnalysisApi> = {
        classifySections: apiClient.classifySections?.bind(apiClient),
        analyzeGenericFields: apiClient.analyzeGenericFields?.bind(apiClient),
      };
      if (!api.classifySections || !api.analyzeGenericFields)
        return blockRow("REMATCH_UNAVAILABLE");
      let keys: string[];
      try {
        // Only the changed row is rematched. A previous row's result must not
        // be reused for another education stage with the same visible labels.
        const ids = new Set(
          row.fields
            .filter(({ element }) => !boundRow || boundRow.contains(element))
            .map(({ candidate }) => candidate.candidateId),
        );
        const rowSnapshot = bindGenericStructureRows(
          {
            ...after.fieldsSnapshot,
            request: {
              ...after.fieldsSnapshot.request,
              sections: after.fieldsSnapshot.request.sections
                .map((section) => ({
                  ...section,
                  fields: section.fields.filter((field) =>
                    ids.has(field.candidateId),
                  ),
                  items: (section.items ?? [])
                    .map((item) => ({
                      ...item,
                      fields: item.fields.filter((field) =>
                        ids.has(field.candidateId),
                      ),
                    }))
                    .filter((item) => item.fields.length > 0),
                }))
                .filter(
                  (section) =>
                    section.fields.length > 0 ||
                    (section.items?.length ?? 0) > 0,
                ),
            },
          },
          context,
        );
        const analysis = await analyzeGenericFields(
          rowSnapshot,
          document,
          api as GenericAnalysisApi,
          profile,
          createGenericAnalysisCache(),
        );
        const visibleIds = new Set(
          row.fields
            .filter(({ candidate }) => {
              const lookup = rowSnapshot.registry.lookupField(
                candidate.candidateId,
              );
              return (
                "handle" in lookup && !isFieldCandidateHidden(lookup.handle)
              );
            })
            .map(({ candidate }) => candidate.candidateId),
        );
        keys = analysis.analysis.fields.flatMap((field) =>
          visibleIds.has(field.candidateId) &&
          field.matchType === "MATCH" &&
          field.valueBinding &&
          "profileFieldKey" in field.valueBinding &&
          field.valueBinding.profileFieldKey
            ? [field.valueBinding.profileFieldKey]
            : [],
        );
      } catch {
        return blockRow("REMATCH_UNAVAILABLE");
      }
      const prefix = `education.${sectionOfKind(kind)}.`;
      if (keys.length === 0 || keys.some((key) => !key.startsWith(prefix)))
        return blockRow("STAGE_KEY_MISMATCH");
      record({
        kind: "SELECT_ROW_KIND",
        ...(group.title ? { sectionTitle: group.title } : {}),
        result: "done",
        rowIndex,
      });
      return true;
    } finally {
      release();
    }
  }

  /**
   * A section the page shows as one row: the smallest box holding its first
   * and last fields and no field of another section, when that box offers an
   * add-like control (an "add" name or a drawn plus). Rows the page already
   * repeats are read by the repeat-row boundary instead.
   */
  function rowBoxOf(
    section: GenericSection<LoopField>,
    sections: readonly GenericSection<LoopField>[],
  ): Element | undefined {
    if (section.boundary === "repeat-row") return undefined;
    const first = section.fields[0]?.element;
    const last = section.fields.at(-1)?.element;
    if (!first || !last) return undefined;
    const foreign = sections
      .filter((other) => other !== section)
      .flatMap((other) => other.fields.map(({ element }) => element));
    for (
      let box: Element | null = first.parentElement;
      box && box !== document.body;
      box = box.parentElement
    ) {
      if (foreign.some((element) => box!.contains(element))) return undefined;
      if (!box.contains(last)) continue;
      return Array.from(box.querySelectorAll<HTMLElement>("button")).some(
        (button) => !isHiddenElement(button) && isAddLike(button),
      )
        ? box
        : undefined;
    }
    return undefined;
  }

  /**
   * An education section whose single row starts with a listbox button that
   * names the row's stage. The row is the smallest box holding that button
   * and the section's last field.
   */
  function listboxKindRow(
    section: GenericSection<LoopField>,
    sections: readonly GenericSection<LoopField>[] = [],
  ): { row: Element; kind: HTMLElement } | undefined {
    if (section.boundary === "repeat-row") return undefined;
    const first = section.fields[0]?.element;
    const last = section.fields.at(-1)?.element;
    if (!first || !last) return undefined;
    const foreign = sections
      .filter((other) => other !== section)
      .flatMap((other) => other.fields.map(({ element }) => element));
    const precedingKind = (box: Element) =>
      Array.from(box.querySelectorAll<HTMLElement>("[aria-haspopup='listbox']"))
        .filter((element) => !isHiddenElement(element))
        .filter(
          (element) =>
            (element.compareDocumentPosition(first) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        )
        .at(-1);
    for (
      let row: Element | null = first.parentElement;
      row && row !== document.body;
      row = row.parentElement
    ) {
      if (foreign.some((element) => row!.contains(element))) return undefined;
      if (!row.contains(last)) continue;
      const kind = precedingKind(row);
      if (kind) return { row, kind };
    }
    return undefined;
  }

  /** Rows with the same control layout as the first row, outermost first. */
  function sameLayoutRows(row: Element, scope: Element): Element[] {
    const layout = controlLayout(row);
    // A box around the first row matches while it holds that row alone.
    const found = Array.from(scope.querySelectorAll(row.tagName)).filter(
      (candidate) =>
        (candidate === row || !candidate.contains(row)) &&
        controlLayout(candidate) === layout,
    );
    return found.filter(
      (candidate) =>
        !found.some((other) => other !== candidate && other.contains(candidate)),
    );
  }

  async function waitFor<T>(
    read: () => T | undefined,
    timeoutMs = 2000,
  ): Promise<T | undefined> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = read();
      if (value !== undefined || Date.now() >= until || aborted()) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Presses the add control the server picks in the last row until `needed`
   * rows with the first row's layout exist. Each press must add exactly one
   * row and leave the existing rows' values as they were. Returns the fresh
   * observation, or undefined after recording why it stopped.
   */
  async function addRowsUntil(
    firstRow: Element,
    needed: number,
    title: string | undefined,
    canonicalFieldKey: string,
    start: Observation,
  ): Promise<Observation | undefined> {
    const scope = document.body;
    let observation = start;
    const valuesOf = (rows: Element[]) =>
      rows
        .flatMap((row) =>
          Array.from(
            row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
              "input, textarea, select",
            ),
          ),
        )
        .map((control) => `${control.isConnected}\u0000${control.value}`)
        .join("\u0001");
    const blocked = (reason: string) => {
      record({ kind: "ADD_ROW", ...(title ? { sectionTitle: title } : {}), result: "blocked", reason });
      return undefined;
    };
    for (let added = 0; ; added += 1) {
      const rows = sameLayoutRows(firstRow, scope);
      if (rows.length >= needed) return observation;
      if (aborted()) return undefined;
      if (added >= MAX_ACTIONS_PER_SECTION) return blocked("SECTION_ACTION_LIMIT");
      const last = rows.at(-1)!;
      // A drawn minus removes a row; it is never offered as an add control.
      const refs = actionRefs(observation).filter(
        (ref) =>
          isOfferableAddControl(ref) &&
          last.contains(ref.element) &&
          iconGlyphLabel(ref.element) !== "-",
      );
      if (refs.length === 0) return blocked("NO_ADD_CONTROL");
      const chosenId = await askButtons(
        "REPEAT_ADD",
        canonicalFieldKey,
        refs,
        observation,
        (ref) => {
          const own = controlLabel(ref.element);
          const heading = normalizedLabel(title);
          const labels = [
            ...(own ? [own] : []),
            ...(heading ? [{ source: "section-heading" as const, text: heading }] : []),
          ];
          return {
            candidateId: ref.candidateId,
            element: ref.observed.element as InteractionCandidate["element"],
            control: "button",
            visibility: ref.observed.visibility,
            relationToTarget: "SAME_REPEAT_ROW",
            ...(labels.length > 0 ? { semanticContext: { labels } } : {}),
          };
        },
      );
      const chosen = refs.find((ref) => ref.candidateId === chosenId);
      if (!chosen || !isSafeStructuralClick(chosen.element, document.body).allowed)
        return blocked(chosenId === undefined ? "INTERACTION_UNAVAILABLE" : "REPEAT_ADD_ABSTAINED");
      const before = valuesOf(rows);
      chosen.element.click();
      const grown = await waitFor(() =>
        sameLayoutRows(firstRow, scope).length === rows.length + 1 ? true : undefined,
      );
      await settle();
      if (document.URL !== initialUrl) return undefined;
      if (!grown || valuesOf(rows) !== before)
        return blocked(grown ? "executor:existing-group-value-changed" : "ADD_FAILED");
      record({ kind: "ADD_ROW", ...(title ? { sectionTitle: title } : {}), result: "done", rowsBefore: rows.length, rowsAfter: rows.length + 1 });
      observation = await observe();
    }
  }

  /**
   * Grows each non-education area the page shows as one row with an add-like
   * control to the profile's entry count, and binds row i to entry i.
   * Returns its observation when it changed nothing, so the loop can reuse it.
   */
  async function prepareSingleRowRepeats(
    start: Observation | undefined,
  ): Promise<Observation | undefined> {
    const many = PROFILE_CATEGORIES.some(
      ({ id }) => id !== "education" && (repeatedEntries(profile, id) ?? 0) >= 2,
    );
    if (!many) return start;
    let observation = start ?? (await observe());
    let changed = false;
    const handled: Element[] = [];
    for (;;) {
      if (aborted()) return undefined;
      const sections = observation.sections;
      const next = sections
        .map((section) => ({
          section,
          category: classified.get(sectionCacheKey(section)),
          box: rowBoxOf(section, sections),
        }))
        .find(
          ({ category, box }) =>
            box !== undefined &&
            category !== undefined &&
            category !== "education" &&
            (repeatedEntries(profile, category) ?? 0) >= 2 &&
            !handled.some((row) => row === box || row.contains(box) || box.contains(row)),
        );
      if (!next) return changed ? undefined : observation;
      const { section, category, box } = next as {
        section: GenericSection<LoopField>;
        category: string;
        box: Element;
      };
      const needed = repeatedEntries(profile, category)!;
      const key = profileKeyOf(category as ProfileCategoryId);
      const rowsBefore = sameLayoutRows(box, document.body).length;
      const grown = key
        ? await addRowsUntil(box, needed, section.title, key, observation)
        : undefined;
      const rows = sameLayoutRows(box, document.body);
      handled.push(...rows);
      if (rows.length !== rowsBefore) changed = true;
      if (grown && rows.length >= needed)
        rows
          .slice(0, needed)
          .forEach((row, index) => context.repeatRows.set(row, { category, index }));
      observation = grown ?? (await observe());
    }
  }

  /**
   * Adds rows through the section's add control and chooses each row's stage
   * in its listbox, so every profile education entry gets its own row.
   */
  /** Returns its observation when it changed nothing, so the loop can reuse it. */
  async function prepareListboxEducationRows(): Promise<Observation | undefined> {
    const wanted = profile.education
      .map((entry, index) => ({ entry, index, kind: kindOfEntry(entry) }))
      .filter(
        (item): item is { entry: (typeof profile.education)[number]; index: number; kind: EducationRowKind } =>
          item.kind !== undefined,
      );
    if (
      wanted.length < 2 ||
      !Array.from(
        document.querySelectorAll<HTMLElement>("[aria-haspopup='listbox']"),
      ).some((element) => !isHiddenElement(element))
    )
      return undefined;
    const rank: EducationRowKind[] = [
      "HIGH_SCHOOL",
      "JUNIOR_COLLEGE",
      "UNIVERSITY",
      "MASTER",
      "DOCTOR",
    ];
    wanted.sort((a, b) => rank.indexOf(b.kind) - rank.indexOf(a.kind));
    let observation = await observe();
    const section = observation.sections.find(
      (candidate) =>
        classified.get(sectionCacheKey(candidate)) === "education" &&
        listboxKindRow(candidate, observation.sections) !== undefined,
    );
    if (!section) return observation;
    const { row: firstRow, kind: firstKind } = listboxKindRow(
      section,
      observation.sections,
    )!;
    const scope = document.body;
    const title = section.title;
    const listboxesOf = (row: Element) =>
      Array.from(row.querySelectorAll<HTMLElement>("[aria-haspopup='listbox']"))
        .filter((element) => !isHiddenElement(element));
    // Every row holds the stage control at the same place as the first row.
    const kindIndex = listboxesOf(firstRow).indexOf(firstKind);
    const kindOf = (row: Element) => listboxesOf(row)[kindIndex];
    const valuesOf = (rows: Element[]) =>
      rows
        .flatMap((row) =>
          Array.from(
            row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
              "input, textarea, select",
            ),
          ),
        )
        .map((control) => `${control.isConnected}\u0000${control.value}`)
        .join("\u0001");
    const grown = await addRowsUntil(
      firstRow,
      wanted.length,
      title,
      REPEAT_KEYS.education!,
      observation,
    );
    if (!grown) return;
    observation = grown;
    const rows = sameLayoutRows(firstRow, scope).slice(0, wanted.length);
    const parent = rows.length > 1
      ? (() => {
          let common: Element | null = rows[0]!.parentElement;
          while (common && !rows.every((row) => common!.contains(row)))
            common = common.parentElement;
          return common;
        })()
      : rows[0]?.parentElement;
    if (parent) context.educationGroups.add(parent);
    const sectionCounts = new Map<string, number>();
    for (const [rowIndex, row] of rows.entries()) {
      const item = wanted[rowIndex]!;
      const kindButton = kindOf(row);
      const blockRow = (reason: string) => {
        context.blockedScopes.set(row, reason);
        record({ kind: "SELECT_ROW_KIND", ...(title ? { sectionTitle: title } : {}), result: "blocked", reason, rowIndex });
      };
      if (!kindButton || !isSafeStructuralClick(kindButton, document.body).allowed) {
        blockRow("ROW_KIND_CONTROL_UNAVAILABLE");
        continue;
      }
      const listboxesBefore = new Set(
        Array.from(document.querySelectorAll("[role='listbox']")).filter(
          (element) => !isHiddenElement(element as HTMLElement),
        ),
      );
      kindButton.click();
      const listbox = await waitFor(() => {
        const controlled = kindButton.getAttribute("aria-controls");
        const linked = controlled ? document.getElementById(controlled) : null;
        if (linked && !isHiddenElement(linked as HTMLElement)) return linked;
        const fresh = Array.from(document.querySelectorAll("[role='listbox']")).filter(
          (element) => !listboxesBefore.has(element) && !isHiddenElement(element as HTMLElement),
        );
        return fresh.length === 1 ? fresh[0] : undefined;
      });
      const close = () =>
        kindButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (!listbox) {
        blockRow("ROW_KIND_OPTIONS_NOT_SHOWN");
        continue;
      }
      const options = Array.from(listbox.querySelectorAll<HTMLElement>("[role='option']")).filter(
        (option) => !isHiddenElement(option) && normalizedLabel(option.textContent),
      );
      const texts = options.map((option) => normalizedLabel(option.textContent));
      const signature = texts.join("\u0000");
      let byTarget = rowKindOptions.get(signature);
      if (!byTarget) {
        questions.push({ role: "ROW_KIND_OPTION", candidates: texts.map(truncated) });
        try {
          byTarget = apiClient.decideInteractions
            ? await decideRowKindOptions(
                { decideInteractions: apiClient.decideInteractions.bind(apiClient) },
                {
                  snapshotId: observation.fieldsSnapshot.request.snapshotId,
                  site: observation.prep.request.site,
                  canonicalFieldKey: REPEAT_KEYS.education!,
                  relationToTarget: "SAME_REPEAT_ROW",
                  options: texts.map((text, index) => ({
                    optionId: String(index),
                    visibility: "visible" as const,
                    semanticContext: { labels: [{ source: "label" as const, text: truncated(text) }] },
                  })),
                },
              )
            : new Map();
        } catch {
          byTarget = new Map();
        }
        rowKindOptions.set(signature, byTarget);
      }
      const optionId = byTarget.get(TARGET_OF_ROW_KIND[item.kind]);
      const option = optionId === null || optionId === undefined ? undefined : options[Number(optionId)];
      if (!option) {
        close();
        blockRow("ROW_KIND_OPTION_UNDECIDED");
        continue;
      }
      const optionText = normalizedLabel(option.textContent);
      const shownBefore = displayedValue(kindButton);
      option.click();
      // A listbox button may show a shorter form of the chosen option.
      // The page may render a new button in the row for the chosen stage.
      const chosenButton = await waitFor(() => {
        const current = kindOf(row);
        const shown = current ? displayedValue(current) : "";
        return current &&
          shown &&
          (shown === optionText ||
            (shown !== shownBefore && optionText.startsWith(shown)))
          ? current
          : undefined;
      });
      const chosenShown = chosenButton !== undefined;
      await settle();
      if (!chosenShown) {
        close();
        blockRow("ROW_KIND_NOT_RETAINED");
        continue;
      }
      const sectionId = sectionOfKind(item.kind);
      const sectionIndex = sectionCounts.get(sectionId) ?? 0;
      sectionCounts.set(sectionId, sectionIndex + 1);
      context.educationRows.set(genericRowFor(chosenButton!) ?? row, {
        sectionId,
        sectionIndex,
        label: optionText,
        kindControl: chosenButton!,
      });
      record({ kind: "SELECT_ROW_KIND", ...(title ? { sectionTitle: title } : {}), result: "done", rowIndex });
    }
  }

  let previousSignature: string | undefined;
  try {
    let prepared = aborted() ? undefined : await prepareListboxEducationRows();
    prepared = aborted() ? undefined : await prepareSingleRowRepeats(prepared);
    for (let iteration = 0; ; iteration += 1) {
      if (aborted()) {
        stopReason = "ABORTED";
        break;
      }
      if (iteration >= MAX_ITERATIONS) {
        stopReason = "ITERATION_LIMIT";
        break;
      }
      const observation = prepared ?? (await observe());
      prepared = undefined;
      const points = computePoints(observation);
      initialRemaining ??= points.map(describe);
      if (points.length === 0) break;
      const signatureNow = JSON.stringify(points.map(describe));
      if (signatureNow === previousSignature) {
        stopReason = "NO_PROGRESS";
        for (const point of points)
          if (point.kind !== "REVEAL_SECTION")
            blockGroup(point.group, "NO_PROGRESS");
        break;
      }
      let acted = false;
      for (const point of points) {
        if (point.kind === "ADD_ROW") acted = await addRow(point, observation);
        else if (point.kind === "REVEAL_SECTION")
          acted = await revealSection(point, observation);
        else acted = await selectRowKind(point, observation);
        if (acted) break;
        if (aborted()) break;
      }
      previousSignature = acted ? signatureNow : undefined;
      if (!acted && points.every((point) => point.kind === "REVEAL_SECTION")) {
        // Every collapsed control was declined; nothing else can change.
        const pending = points.filter(
          (point) =>
            point.kind === "REVEAL_SECTION" &&
            !revealChosen.has(point.action.element) &&
            !revealAsked.has(point.action.element),
        );
        if (pending.length === 0) break;
      }
    }
  } catch {
    // A local failure must end the loop, never the whole preparation step.
    stopReason = "FAILED";
    context.blockedScopes.set(document.body, "STRUCTURE_LOOP_FAILED");
  }

  return {
    context,
    stopReason,
    actions,
    sections: [...sectionsSeen.values()],
    initialRemaining: initialRemaining ?? [],
    questions,
  };
}
